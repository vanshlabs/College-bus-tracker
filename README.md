# 🚌 College Bus Tracker

A full-stack college transportation management system designed to simplify bus tracking, route exploration, and transport administration.

Built using **Python, Flask, SQLite, HTML, CSS, and JavaScript**.

## ✨ Features

- **Role-based access:** Separate access for students, drivers, administrators, and maintenance staff.
- **Bus Route Explorer:** Browse available buses and explore their routes.
- **Stop Timetables:** View scheduled pickup stops and arrival times.
- **Interactive Maps:** Visualize bus routes and stops using Leaflet and OpenStreetMap.
- **Delay Alerts:** Manage and view transport delay notifications.
- **Transport Records:** Maintain fuel, maintenance, and boarding records.
- **Responsive Interface:** Access the system through a clean web interface.

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Backend | Python, Flask |
| Database | SQLite |
| ORM | Flask-SQLAlchemy |
| Authentication | Flask-JWT-Extended |
| Frontend | HTML, CSS, JavaScript |
| Maps | Leaflet, OpenStreetMap |
| Routing | OSRM |

## 📂 Project Structure

```text
College Smart Bus Tracker/
│
├── app.py
├── routes.json
├── requirements.txt
├── README.md
│
├── static/
│   ├── app.js
│   └── style.css
│
└── templates/
    └── index.html
```

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
```

### 2. Navigate to the project folder

```bash
cd "College Smart Bus Tracker"
```

### 3. Create a virtual environment

```bash
python -m venv venv
```

### 4. Activate the environment

**Windows:**

```powershell
.\venv\Scripts\Activate.ps1
```

### 5. Install dependencies

```bash
pip install -r requirements.txt
```

### 6. Run the application

```bash
python app.py
```

Open the local URL displayed in your terminal.

## 🗺️ Maps and Routing

The application uses Leaflet and OpenStreetMap for map visualization, with external geocoding and routing services to display road-following routes.

Internet access is required for these external map services. Their availability and usage limits may apply.

## 🔮 Future Improvements

- Live GPS tracking of buses
- Real-time arrival estimates
- Enhanced administrative dashboard
- Improved route and driver management
- Mobile application integration

## 👨‍💻 About

Developed as a college project to explore full-stack web development, database management, API integration, authentication, and interactive mapping.

---

**College Bus Tracker — Making campus transportation smarter.**
