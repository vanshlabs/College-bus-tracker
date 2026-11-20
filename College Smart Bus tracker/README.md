# Smart Medi-Caps Transport — Indore & Dewas Edition

Responsive Flask transport app using the supplied first-shift bus-route PDF.

## Included routes
- 22 bus routes from the uploaded schedule, restricted to Indore and Dewas.
- Dewas routes: Bus 23, Bus 30 and Bus 42.
- Indore routes: Bus 15–20, 25–27 and 32–41.
- Bus 12 (Mhow) is excluded because it is outside the requested Indore/Dewas city filter.
- Bus 34 includes Dewas Naka as an Indore stop; it is retained as an Indore route.
- Original stop order and first-shift times are preserved from the route sheet.

## Run locally
1. Extract the ZIP.
2. Open a terminal in this folder.
3. Install dependencies:
   `pip install -r requirements.txt`
4. Start:
   `python app.py`
5. Open `http://127.0.0.1:5000`.

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Student (default Bus 34 / Indore) | student1@medicaps.edu | student123 |
| Student (default Bus 25 / Indore) | student2@medicaps.edu | student123 |
| Driver | driver1@medicaps.edu | driver123 |
| Driver | driver2@medicaps.edu | driver123 |
| Admin | admin@medicaps.edu | admin123 |
| Maintenance | maint@medicaps.edu | maint123 |

## Student features
- The student's assigned route is selected by default.
- Search routes by bus number, city, route origin or stop name.
- Filter between Indore and Dewas.
- Each selected route displays its bus number, ordered stops and the scheduled arrival time at each stop.
- Delay reports are added to the displayed schedule.
- Students can browse routes other than their assigned route without changing their default route.

## Road-following map
- Uses Leaflet + OpenStreetMap tiles, Nominatim geocoding and OSRM routing.
- No Google Maps key or paid API key is required.
- The selected route is geocoded stop-by-stop, then road geometry is requested between consecutive stops.
- The public Nominatim and OSRM demo services have usage limits and require an internet connection. For production/high traffic, host or subscribe to a routing/geocoding service.
- Stop names that are ambiguous or not found may be omitted from the map; their timetable entry remains visible.

## GPS / ETA notes
- The PDF provides route stop names and scheduled times, not live bus coordinates.
- Live bus locations appear only after a driver sends GPS from the Driver > Trip controls screen (browser location permission required; localhost or HTTPS).
- Schedule times are the official times shown in the supplied route sheet; they are not live GPS ETAs.
- This edition does not fabricate coordinates or pretend that scheduled arrivals are live GPS readings.

## Database
- On first run, the app seeds the 22 supplied routes and demo users.
- If the old two-route sample database is present, startup replaces that sample seed with the 22-route schedule.
- Back up `instance/transport.db` before using this with real records.
- Change `JWT_SECRET` before any public deployment. Demo credentials are for local testing only.


## Bus exploration (no GPS required)
- Students can open **Find bus / stop** to search by bus number, route name, stop, or city.
- The student's assigned route is selected by default, but other Indore and Dewas buses can be explored.
- Each bus card has an **Explore this bus** action. Selecting it opens the route, ordered stops, scheduled first-shift times, and road map.
- The **Bus tracking** page also lists all buses and has a **View bus & route** action on each card.
- Since no GPS feed has been supplied, bus cards explicitly show GPS unavailable and live ETA is not fabricated. The road map shows the scheduled route only.
- Road routing and stop geocoding use public OpenStreetMap/Nominatim/OSRM services and require internet access; public endpoints have usage limits and are intended for testing.
