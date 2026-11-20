"""Smart Medi-Caps College Transport System - Flask REST API + GPS simulator."""
import json, math, os, random, threading, time
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, jsonify, request, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (JWTManager, create_access_token, jwt_required,
                                get_jwt, get_jwt_identity)
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config.update(
    SQLALCHEMY_DATABASE_URI="sqlite:///transport.db",
    JWT_SECRET_KEY=os.environ.get("JWT_SECRET", "change-this-secret-key-before-deploying-1234"),
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(hours=8))
db, jwt = SQLAlchemy(app), JWTManager(app)
DELAY_LIMIT_MIN = 10   # delay at/above this creates an alert
AVG_KMPH = 25          # used for ETA

# ---------- models ----------
class User(db.Model):  # one login table for all four roles
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80)); email = db.Column(db.String(120), unique=True)
    password_hash = db.Column(db.String(200)); role = db.Column(db.String(20))
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"), nullable=True)

class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True); name = db.Column(db.String(120))
    city = db.Column(db.String(30), default="Indore")
    stops_json = db.Column(db.Text)  # [{"name","lat","lng"}], last stop = college
    @property
    def stops(self): return json.loads(self.stops_json)

class Bus(db.Model):
    id = db.Column(db.Integer, primary_key=True); number = db.Column(db.String(20))
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"))
    driver_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    status = db.Column(db.String(20), default="running")
    delay_min = db.Column(db.Integer, default=0)
    lat = db.Column(db.Float); lng = db.Column(db.Float)
    next_stop = db.Column(db.Integer, default=1); updated = db.Column(db.DateTime)

class FuelRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True); bus_id = db.Column(db.Integer, db.ForeignKey("bus.id"))
    litres = db.Column(db.Float); mileage = db.Column(db.Float); date = db.Column(db.DateTime, default=datetime.now)

class MaintenanceRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True); bus_id = db.Column(db.Integer, db.ForeignKey("bus.id"))
    issue = db.Column(db.String(200)); status = db.Column(db.String(20)); date = db.Column(db.DateTime, default=datetime.now)

class BoardingRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True); student_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    bus_id = db.Column(db.Integer, db.ForeignKey("bus.id")); stop = db.Column(db.String(80))
    time = db.Column(db.DateTime, default=datetime.now)

class DelayAlert(db.Model):
    id = db.Column(db.Integer, primary_key=True); bus_id = db.Column(db.Integer, db.ForeignKey("bus.id"))
    delay_min = db.Column(db.Integer); message = db.Column(db.String(200)); created = db.Column(db.DateTime, default=datetime.now)

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True); user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    message = db.Column(db.String(200)); created = db.Column(db.DateTime, default=datetime.now)

def d(o):
    out = {}
    for c in o.__table__.columns:
        v = getattr(o, c.name)
        out[c.name] = v.isoformat(sep=" ", timespec="seconds") if isinstance(v, datetime) else v
    return out

# ---------- helpers ----------
def roles(*allowed):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            if get_jwt()["role"] not in allowed: return jsonify(error="Not allowed for your role"), 403
            return f(*a, **k)
        return jwt_required()(w)
    return deco

def hav(a, b, c, e):  # km between two lat/lng points
    p = math.pi / 180
    h = math.sin((c-a)*p/2)**2 + math.cos(a*p)*math.cos(c*p)*math.sin((e-b)*p/2)**2
    return 12742 * math.asin(math.sqrt(h))

def eta(bus):
    if bus.lat is None or bus.lng is None:
        return None
    st = db.session.get(Route, bus.route_id).stops
    i = min(bus.next_stop, len(st)-1)
    if st[i].get("lat") is None or st[i].get("lng") is None:
        return None
    km = hav(bus.lat, bus.lng, st[i]["lat"], st[i]["lng"])
    total = km
    for j in range(i, len(st)-1):
        a, b = st[j], st[j+1]
        if None in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
            return None
        total += hav(a["lat"], a["lng"], b["lat"], b["lng"])
    return {"next_stop": st[i]["name"], "next_min": round(km/AVG_KMPH*60),
            "college_min": round(total/AVG_KMPH*60) + (bus.delay_min or 0)}

def set_location(bus, lat, lng):
    bus.lat, bus.lng, bus.updated = lat, lng, datetime.now()
    st = db.session.get(Route, bus.route_id).stops
    i = min(bus.next_stop, len(st)-1)
    if st[i].get("lat") is not None and st[i].get("lng") is not None:
        if hav(lat, lng, st[i]["lat"], st[i]["lng"]) < 0.15 and bus.next_stop < len(st)-1:
            bus.next_stop += 1

def set_delay(bus, minutes):
    bus.delay_min = minutes
    if minutes < DELAY_LIMIT_MIN: return
    recent = DelayAlert.query.filter(DelayAlert.bus_id == bus.id,
                                     DelayAlert.created > datetime.now() - timedelta(minutes=15)).first()
    if recent: return
    msg = f"Bus {bus.number} is running about {minutes} min late."
    db.session.add(DelayAlert(bus_id=bus.id, delay_min=minutes, message=msg))
    for s in User.query.filter_by(role="student", route_id=bus.route_id):
        db.session.add(Notification(user_id=s.id, message=msg))

def own_bus_or_admin(bus):
    return get_jwt()["role"] == "admin" or bus.driver_id == int(get_jwt_identity())

# ---------- API ----------
@app.get("/")
def index(): return render_template("index.html")

@app.post("/api/login")
def login():
    j = request.get_json(force=True)
    u = User.query.filter_by(email=j.get("email", "").strip().lower()).first()
    if not u or not check_password_hash(u.password_hash, j.get("password", "")):
        return jsonify(error="Wrong email or password"), 401
    tok = create_access_token(identity=str(u.id), additional_claims={"role": u.role})
    return jsonify(token=tok, user={"id": u.id, "name": u.name, "role": u.role, "route_id": u.route_id})

@app.get("/api/routes")
@jwt_required()
def routes_api():
    out = []
    for r in Route.query.order_by(Route.name).all():
        bus = Bus.query.filter_by(route_id=r.id).first()
        out.append({"id": r.id, "name": r.name, "city": r.city,
                    "bus_id": bus.id if bus else None, "bus_number": bus.number if bus else None,
                    "status": bus.status if bus else "unknown", "delay_min": bus.delay_min if bus else 0,
                    "lat": bus.lat if bus else None, "lng": bus.lng if bus else None,
                    "stops": r.stops})
    return jsonify(out)

@app.get("/api/buses")
@jwt_required()
def buses():
    q = Bus.query
    if get_jwt()["role"] == "student" and request.args.get("all") != "1":
        q = q.filter_by(route_id=db.session.get(User, int(get_jwt_identity())).route_id)
    out = []
    for b in q:
        x, r, drv = d(b), db.session.get(Route, b.route_id), db.session.get(User, b.driver_id)
        x.update(route=r.name, stops=r.stops, driver=drv.name if drv else None, eta=eta(b))
        out.append(x)
    return jsonify(out)

@app.post("/api/buses/<int:bid>/location")
@roles("driver", "admin")
def update_location(bid):
    bus, j = db.get_or_404(Bus, bid), request.get_json(force=True)
    if not own_bus_or_admin(bus): return jsonify(error="Not your bus"), 403
    set_location(bus, float(j["lat"]), float(j["lng"])); db.session.commit()
    return jsonify(ok=True)

@app.post("/api/buses/<int:bid>/status")
@roles("driver", "admin")
def update_status(bid):
    bus, j = db.get_or_404(Bus, bid), request.get_json(force=True)
    if not own_bus_or_admin(bus): return jsonify(error="Not your bus"), 403
    bus.status = j.get("status", bus.status); set_delay(bus, int(j.get("delay_min", 0)))
    db.session.commit(); return jsonify(ok=True)

@app.get("/api/notifications")
@jwt_required()
def notifications():
    q = Notification.query.filter_by(user_id=int(get_jwt_identity())).order_by(Notification.id.desc()).limit(30)
    return jsonify([d(n) for n in q])

@app.get("/api/alerts")
@roles("admin")
def alerts(): return jsonify([d(a) for a in DelayAlert.query.order_by(DelayAlert.id.desc()).limit(50)])

@app.route("/api/boarding", methods=["GET", "POST"])
@roles("student", "driver", "admin")
def boarding():
    role = get_jwt()["role"]
    if request.method == "POST":
        if role != "student": return jsonify(error="Only students can board"), 403
        j, uid = request.get_json(force=True), int(get_jwt_identity())
        db.session.add(BoardingRecord(student_id=uid, bus_id=int(j["bus_id"]), stop=j["stop"]))
        db.session.commit(); return jsonify(ok=True)
    if role == "student": return jsonify(error="Not allowed for your role"), 403
    q = BoardingRecord.query.order_by(BoardingRecord.id.desc()).limit(100)
    return jsonify([{**d(r), "student": db.session.get(User, r.student_id).name} for r in q])

KINDS = {"fuel": (FuelRecord, ("litres", "mileage"), ("driver", "maintenance", "admin")),
         "maintenance": (MaintenanceRecord, ("issue", "status"), ("maintenance", "admin"))}

@app.route("/api/records/<kind>", methods=["GET", "POST"])
@roles("driver", "maintenance", "admin")
def records(kind):
    if kind not in KINDS: return jsonify(error="Unknown record type"), 404
    M, fields, writers = KINDS[kind]
    if request.method == "POST":
        j = request.get_json(force=True)
        if get_jwt()["role"] not in writers or (kind == "fuel" and get_jwt()["role"] == "admin"):
            return jsonify(error="Not allowed for your role"), 403
        db.session.add(M(bus_id=int(j["bus_id"]), **{f: j[f] for f in fields})); db.session.commit()
        return jsonify(ok=True)
    return jsonify([d(r) for r in M.query.order_by(M.id.desc()).limit(100)])

# ---------- seed data + GPS simulator ----------
def seed():
    # Replace the original sample routes with the supplied Indore/Dewas schedule.
    if Route.query.count() == 22 and Bus.query.count() == 22:
        return
    if User.query.first():
        Notification.query.delete()
        DelayAlert.query.delete()
        BoardingRecord.query.delete()
        FuelRecord.query.delete()
        MaintenanceRecord.query.delete()
        Bus.query.delete()
        User.query.delete()
        Route.query.delete()
        db.session.commit()

    with open(os.path.join(os.path.dirname(__file__), "routes.json"), encoding="utf-8") as f:
        route_data = json.load(f)

    def u(name, email, pw, role, route=None):
        x = User(name=name, email=email, password_hash=generate_password_hash(pw), role=role, route_id=route)
        db.session.add(x)
        return x

    u("Admin", "admin@medicaps.edu", "admin123", "admin")
    d1 = u("Ramesh (Driver)", "driver1@medicaps.edu", "driver123", "driver")
    d2 = u("Suresh (Driver)", "driver2@medicaps.edu", "driver123", "driver")
    u("Mohan (Maintenance)", "maint@medicaps.edu", "maint123", "maintenance")
    db.session.flush()

    created = {}
    for item in route_data:
        route = Route(name=item["name"], city=item["city"], stops_json=json.dumps(item["stops"], ensure_ascii=False))
        db.session.add(route)
        db.session.flush()
        created[item["bus_number"]] = route

    # Demo student accounts default to an Indore route; students can search all routes.
    u("Anita (Student)", "student1@medicaps.edu", "student123", "student", created["34"].id)
    u("Rohan (Student)", "student2@medicaps.edu", "student123", "student", created["25"].id)
    db.session.flush()

    for idx, item in enumerate(route_data):
        db.session.add(Bus(number=f"Bus {item['bus_number']}", route_id=created[item["bus_number"]].id,
                           driver_id=d1.id if idx % 2 == 0 else d2.id, status="running",
                           delay_min=0, lat=None, lng=None, next_stop=0, updated=None))
    db.session.commit()

def simulate(step_km=0.4, tick=3):
    """Moves every bus along its route; occasionally injects a delay."""
    while True:
        time.sleep(tick)
        with app.app_context():
            for b in Bus.query.filter_by(status="running"):
                st = db.session.get(Route, b.route_id).stops
                if b.lat is None or b.lng is None:
                    continue
                t = st[min(b.next_stop, len(st)-1)]
                if t.get("lat") is None or t.get("lng") is None:
                    continue
                dist = hav(b.lat, b.lng, t["lat"], t["lng"])
                f = 1 if dist <= step_km else step_km / dist
                set_location(b, b.lat + (t["lat"]-b.lat)*f, b.lng + (t["lng"]-b.lng)*f)
                if dist <= step_km and b.next_stop >= len(st)-1:  # reached college: restart trip
                    b.next_stop, b.lat, b.lng = 1, st[0]["lat"], st[0]["lng"]
                if random.random() < 0.04: set_delay(b, random.choice([0, 0, 12, 15, 20]))
            db.session.commit()

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        # SQLite create_all does not add columns to an existing database.
        with db.engine.begin() as conn:
            route_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(route)").fetchall()]
            if "city" not in route_cols:
                conn.exec_driver_sql("ALTER TABLE route ADD COLUMN city VARCHAR(30) DEFAULT 'Indore'")
        seed()
    if os.environ.get("SIMULATE", "1") == "1": threading.Thread(target=simulate, daemon=True).start()
    app.run(debug=True, use_reloader=False)
