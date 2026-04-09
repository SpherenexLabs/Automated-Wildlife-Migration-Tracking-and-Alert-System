import React, { useEffect, useMemo, useRef, useState } from "react";
import Radar from "./components/Radar";
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  query,
  orderByChild,
  limitToLast,
  get,
  update,
} from "firebase/database";

/* =========================
   1) FIREBASE CONFIG
   Replace with your Firebase config
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyB9ererNsNonAzH0zQo_GS79XPOyCoMxr4",
  authDomain: "waterdtection.firebaseapp.com",
  databaseURL: "https://waterdtection-default-rtdb.firebaseio.com",
  projectId: "waterdtection",
  storageBucket: "waterdtection.firebasestorage.app",
  messagingSenderId: "690886375729",
  appId: "1:690886375729:web:172c3a47dda6585e4e1810",
  measurementId: "G-TXF33Y6XY0",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* =========================
  2) GOOGLE MAPS API KEY
  Load the API key from Vite env. Create a `.env` or `.env.local`
  with `VITE_GOOGLE_MAPS_API_KEY=your_key_here` (do NOT commit keys).
========================= */
const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyAADbfCsSV024p4bhaeeOtqp1mf1WcKp4o";

/* =========================
   3) DEFAULT GEOFENCES
   You can edit these coordinates/radius
========================= */
const DEFAULT_GEOFENCES = [
  {
    id: "zone_1",
    name: "Village Boundary",
    type: "village",
    center: { lat: 12.8840, lng: 77.5710 },
    radius: 500,
    dwellLimitMinutes: 5,
    color: "#e53935",
  },
  {
    id: "zone_2",
    name: "Farmland Area",
    type: "farmland",
    center: { lat: 12.8930, lng: 77.5740 },
    radius: 400,
    dwellLimitMinutes: 8,
    color: "#fb8c00",
  },
  {
    id: "zone_3",
    name: "Highway Safety Belt",
    type: "highway",
    center: { lat: 12.8900, lng: 77.5670 },
    radius: 300,
    dwellLimitMinutes: 3,
    color: "#8e24aa",
  },
  {
    id: "zone_4",
    name: "Railway Track Alert Zone",
    type: "railway",
    center: { lat: 12.8850, lng: 77.5760 },
    radius: 350,
    dwellLimitMinutes: 2,
    color: "#3949ab",
  },
  {
    id: "zone_5",
    name: "Forest Border",
    type: "forest_border",
    center: { lat: 12.8950, lng: 77.5660 },
    radius: 700,
    dwellLimitMinutes: 10,
    color: "#00897b",
  },
];

/* =========================
   4) MAP LOADER
========================= */
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) {
      resolve(window.google);
      return;
    }

    const existing = document.getElementById("google-maps-script");
    if (existing) {
      if (window.google?.maps?.Map) {
        resolve(window.google);
        return;
      }
      const onLoad = () => resolve(window.google);
      const onError = (e) => reject(e);
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=geometry&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function waitForGoogleMapsReady(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.google?.maps?.Map) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/* =========================
   5) HELPERS
========================= */
function formatDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString();
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function getAlertLevel(zoneType) {
  if (zoneType === "railway" || zoneType === "highway") return "HIGH";
  if (zoneType === "village" || zoneType === "farmland") return "MEDIUM";
  return "LOW";
}

/* =========================
   HAVERSINE DISTANCE (metres) — works without Google Maps
========================= */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dlambda = toRad(lng2 - lng1);
  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toRadarXY(center, point, maxDistanceMeters) {
  const dist = haversineDistance(center.lat, center.lng, point.lat, point.lng);
  const bearing = bearingDegrees(center.lat, center.lng, point.lat, point.lng);
  const theta = (bearing * Math.PI) / 180;
  const n = Math.min(0.95, dist / Math.max(maxDistanceMeters, 1));
  return {
    x: Math.sin(theta) * n,
    y: Math.cos(theta) * n,
    distanceMeters: Math.round(dist),
  };
}

function hasCoordinateFields(obj) {
  if (!obj || typeof obj !== "object") return false;
  const lat = obj.latitude ?? obj.lat;
  const lng = obj.longitude ?? obj.lng;
  return lat != null && lng != null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findLiveCoordinatePayload(raw) {
  if (hasCoordinateFields(raw)) return raw;
  if (!raw || typeof raw !== "object") return null;

  const preferredKeys = ["current", "live", "latest", "location", "tracker", "device"];
  for (const key of preferredKeys) {
    if (hasCoordinateFields(raw[key])) return raw[key];
  }

  return null;
}

function App() {
  const mapRef = useRef(null);
  const mapWrapperRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const pathPolylineRef = useRef(null);
  const geofenceCirclesRef = useRef([]);
  const infoWindowRef = useRef(null);

  const lastProcessedTimestamp = useRef(null);
  const lastSavedSnapshotKeyRef = useRef(null);
  const lastLiveEventKeyRef = useRef(null);
  const pathKeysRef = useRef(new Set());
  const zonePresenceRef = useRef({});
  const popupTimerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const prevDistanceRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [currentAnimal, setCurrentAnimal] = useState(null);
  const [currentUserLocation, setCurrentUserLocation] = useState(null);
  const [pathPoints, setPathPoints] = useState([]);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [popup, setPopup] = useState(null);
  const [systemStatus, setSystemStatus] = useState("Initializing...");
  const [zoneStats, setZoneStats] = useState({});
  const [geofences, setGeofences] = useState(DEFAULT_GEOFENCES);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Get user's live device GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.warn("Geolocation:", err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const updateMarkerPosition = (pos, title) => {
    if (!markerRef.current) return;

    if (typeof markerRef.current.setPosition === "function") {
      markerRef.current.setPosition(pos);
    } else {
      markerRef.current.position = pos;
    }

    if (typeof markerRef.current.setTitle === "function") {
      markerRef.current.setTitle(title);
    } else {
      markerRef.current.title = title;
    }
  };

  const currentZoneSummary = useMemo(() => {
    const inside = [];
    if (!currentAnimal) return inside;

    geofences.forEach((zone) => {
      // Use haversine — works even before Google Maps loads
      const dist = Math.round(
        haversineDistance(
          currentAnimal.lat, currentAnimal.lng,
          zone.center.lat, zone.center.lng
        )
      );
      if (dist <= zone.radius) {
        inside.push({ ...zone, distance: dist });
      }
    });

    return inside;
  }, [currentAnimal, geofences]);

  /* =========================
     6) LOAD MAP
  ========================= */
  useEffect(() => {
    let active = true;
    const previousAuthFailure = window.gm_authFailure;

    window.gm_authFailure = () => {
      if (!active) return;
      setMapError("Google Maps authentication failed. Check API key, referrer restrictions, and billing.");
      setSystemStatus("Google Maps auth failed");
    };

    if (!GOOGLE_MAPS_API_KEY) {
      console.warn("Missing Google Maps API key (VITE_GOOGLE_MAPS_API_KEY)");
      setMapError(
        "Missing Google Maps API key. Create a .env with VITE_GOOGLE_MAPS_API_KEY and restart the dev server."
      );
      setSystemStatus("Missing Google Maps API key");
      return () => {
        active = false;
      };
    }

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(async () => {
        if (!active) return;

        const ready = await waitForGoogleMapsReady();
        if (!ready) {
          throw new Error("Google Maps loaded but API objects were not initialized in time.");
        }

        const MapCtor = window.google?.maps?.Map;
        if (typeof MapCtor !== "function") {
          throw new Error("Google Maps API loaded, but Map constructor is unavailable.");
        }

        // Temporarily remove overflow:hidden so Google Maps can initialize fully
        // without its internal tile layers being clipped (causes blank/split map)
        if (mapWrapperRef.current) {
          mapWrapperRef.current.style.overflow = "visible";
        }

        mapInstance.current = new MapCtor(mapRef.current, {
          center: { lat: 12.9716, lng: 77.5946 },
          zoom: 15,
          mapTypeId: "roadmap",
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: true,
          gestureHandling: "greedy",
        });

        infoWindowRef.current = new window.google.maps.InfoWindow();
        markerRef.current = new window.google.maps.Marker({
          map: mapInstance.current,
          position: { lat: 12.9716, lng: 77.5946 },
          title: "Tracked Animal",
        });

        pathPolylineRef.current = new window.google.maps.Polyline({
          map: mapInstance.current,
          path: [],
          geodesic: true,
          strokeColor: "#1565c0",
          strokeOpacity: 1,
          strokeWeight: 4,
        });

        drawGeofences(DEFAULT_GEOFENCES);

        // Restore overflow:hidden after first idle (all tiles rendered)
        window.google.maps.event.addListenerOnce(mapInstance.current, "idle", () => {
          setMapLoaded(true);
          setSystemStatus("Map loaded successfully");
        });
      })
      .catch((err) => {
        console.error("Google Maps load error:", err);
        setMapError(
          "Failed to load Google Maps API. Check the API key, billing status, and key restrictions in Google Cloud Console."
        );
        setSystemStatus("Failed to load Google Maps API");
      });

    return () => {
      active = false;
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      window.gm_authFailure = previousAuthFailure;
    };
  }, []);

  /* =========================
     7) DRAW GEOFENCES
  ========================= */
  const drawGeofences = (zones) => {
    if (!window.google || !mapInstance.current) return;

    geofenceCirclesRef.current.forEach((circle) => circle.setMap(null));
    geofenceCirclesRef.current = [];

    zones.forEach((zone) => {
      const circle = new window.google.maps.Circle({
        strokeColor: zone.color,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: zone.color,
        fillOpacity: 0.18,
        map: mapInstance.current,
        center: zone.center,
        radius: zone.radius,
      });

      circle.addListener("click", () => {
        infoWindowRef.current.setContent(`
          <div style="min-width:220px;padding:8px;">
            <h3 style="margin:0 0 6px 0;font-size:16px;">${zone.name}</h3>
            <p style="margin:4px 0;"><strong>Type:</strong> ${zone.type}</p>
            <p style="margin:4px 0;"><strong>Radius:</strong> ${zone.radius} m</p>
            <p style="margin:4px 0;"><strong>Dwell Limit:</strong> ${zone.dwellLimitMinutes} min</p>
          </div>
        `);
        infoWindowRef.current.setPosition(zone.center);
        infoWindowRef.current.open(mapInstance.current);
      });

      geofenceCirclesRef.current.push(circle);
    });
  };

  useEffect(() => {
    if (mapLoaded) drawGeofences(geofences);
  }, [geofences, mapLoaded]);

  /* =========================
     8) POPUP ALERT
  ========================= */
  const showPopup = (alertObj) => {
    setPopup(alertObj);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => {
      setPopup(null);
    }, 7000);
  };

  /* =========================
     9) SAVE ALERT
  ========================= */
  const saveAlertToFirebase = async (alertObj) => {
    try {
      const newRef = push(ref(db, "gps/alerts"));
      await set(newRef, alertObj);
    } catch (err) {
      console.error("Alert save failed:", err);
    }
  };

  /* =========================
     10) SAVE HISTORY + PATH
  ========================= */
  const saveTrackingSnapshot = async (animal) => {
    try {
      if (!animal?.timestamp) return;

      const snapshotKey = `${animal.timestamp}|${Number(animal.lat).toFixed(6)}|${Number(
        animal.lng
      ).toFixed(6)}|${Number(animal.speed || 0)}|${animal.status || "moving"}`;

      if (lastSavedSnapshotKeyRef.current === snapshotKey) return;
      if (lastProcessedTimestamp.current === animal.timestamp && lastSavedSnapshotKeyRef.current) return;

      lastProcessedTimestamp.current = animal.timestamp;
      lastSavedSnapshotKeyRef.current = snapshotKey;

      // Store history and path under gps/history and gps/path
      const historyRef = push(ref(db, "gps/history"));
      const pathRef = push(ref(db, "gps/path"));

      const payload = {
        animalId: animal.animalId || "UNKNOWN",
        latitude: Number(animal.lat),
        longitude: Number(animal.lng),
        speed: Number(animal.speed || 0),
        status: animal.status || "moving",
        timestamp: animal.timestamp,
        readableTime: new Date(animal.timestamp).toISOString(),
      };

      await Promise.all([set(historyRef, payload), set(pathRef, payload)]);
    } catch (err) {
      console.error("Tracking snapshot save error:", err);
    }
  };

  /* =========================
     11) UPDATE ZONE VISIT STATS
  ========================= */
  const incrementZoneVisit = async (zone) => {
    try {
      const zoneRef = ref(db, `gps/zoneStats/${zone.id}`);
      const snap = await get(zoneRef);
      const current = snap.exists() ? snap.val() : { count: 0, name: zone.name, type: zone.type };
      await update(zoneRef, {
        name: zone.name,
        type: zone.type,
        count: (current.count || 0) + 1,
        lastVisit: Date.now(),
      });
    } catch (err) {
      console.error("Zone stat update error:", err);
    }
  };

  /* =========================
     12) GEOFENCE LOGIC
  ========================= */
  const evaluateGeofences = async (animal) => {
    if (!animal) return;

    const animalPoint = { lat: animal.lat, lng: animal.lng };
    const now = animal.timestamp || Date.now();

    for (const zone of geofences) {
      // Haversine — no Google Maps dependency
      const distance = haversineDistance(
        animalPoint.lat, animalPoint.lng,
        zone.center.lat, zone.center.lng
      );
      const isInside = distance <= zone.radius;
      const key = zone.id;

      if (!zonePresenceRef.current[key]) {
        zonePresenceRef.current[key] = {
          inside: false,
          enterTime: null,
          lastAlertType: null,
        };
      }

      const state = zonePresenceRef.current[key];

      // ENTER
      if (isInside && !state.inside) {
        state.inside = true;
        state.enterTime = now;
        state.lastAlertType = "ENTER";

        const alertObj = {
          type: "ENTER",
          animalId: animal.animalId || "UNKNOWN",
          zoneId: zone.id,
          zoneName: zone.name,
          zoneType: zone.type,
          level: getAlertLevel(zone.type),
          lat: animal.lat,
          lng: animal.lng,
          distance: Math.round(distance),
          timestamp: now,
          message: `${animal.animalId || "Animal"} entered ${zone.name}`,
        };

        showPopup(alertObj);
        await saveAlertToFirebase(alertObj);
        await incrementZoneVisit(zone);
      }

      // STAY TOO LONG
      if (isInside && state.inside && state.enterTime) {
        const dwellMs = now - state.enterTime;
        const dwellLimitMs = zone.dwellLimitMinutes * 60 * 1000;

        if (dwellMs >= dwellLimitMs && state.lastAlertType !== "DWELL") {
          state.lastAlertType = "DWELL";

          const alertObj = {
            type: "DWELL",
            animalId: animal.animalId || "UNKNOWN",
            zoneId: zone.id,
            zoneName: zone.name,
            zoneType: zone.type,
            level: "HIGH",
            lat: animal.lat,
            lng: animal.lng,
            distance: Math.round(distance),
            dwellTimeMs: dwellMs,
            timestamp: now,
            message: `${animal.animalId || "Animal"} stayed too long in ${zone.name}`,
          };

          showPopup(alertObj);
          await saveAlertToFirebase(alertObj);
        }
      }

      // EXIT
      if (!isInside && state.inside) {
        const dwellMs = state.enterTime ? now - state.enterTime : 0;

        state.inside = false;
        state.enterTime = null;
        state.lastAlertType = "EXIT";

        const alertObj = {
          type: "EXIT",
          animalId: animal.animalId || "UNKNOWN",
          zoneId: zone.id,
          zoneName: zone.name,
          zoneType: zone.type,
          level: getAlertLevel(zone.type),
          lat: animal.lat,
          lng: animal.lng,
          distance: Math.round(distance),
          dwellTimeMs: dwellMs,
          timestamp: now,
          message: `${animal.animalId || "Animal"} exited ${zone.name}`,
        };

        showPopup(alertObj);
        await saveAlertToFirebase(alertObj);
      }
    }
  };

  /* =========================
     13) LIVE CURRENT LOCATION LISTENER
     Reads from Firebase path: gps
     Fields: latitude, longitude (from GPS device)
  ========================= */
  useEffect(() => {
    const currentRef = ref(db, "gps");

    const unsub = onValue(currentRef, async (snapshot) => {
      const data = snapshot.val();
      const livePayload = findLiveCoordinatePayload(data);

      if (!livePayload) {
        setSystemStatus("Connected to Firebase, waiting for live GPS coordinates");
        return;
      }

      const lat = toNumber(livePayload.latitude ?? livePayload.lat);
      const lng = toNumber(livePayload.longitude ?? livePayload.lng);
      if (lat == null || lng == null) {
        setSystemStatus("Invalid GPS coordinate format in Firebase");
        return;
      }

      const incomingTs = toNumber(livePayload.timestamp);
      const eventKey = `${lat.toFixed(6)}|${lng.toFixed(6)}|${Number(
        livePayload.speed || 0
      )}|${livePayload.status || "moving"}|${incomingTs ?? "no-ts"}`;

      // Ignore duplicate events caused by sibling updates under /gps.
      if (lastLiveEventKeyRef.current === eventKey) {
        return;
      }
      lastLiveEventKeyRef.current = eventKey;

      const animal = {
        animalId: livePayload.animalId || "ANIMAL_01",
        lat,
        lng,
        speed: Number(livePayload.speed || 0),
        // Derive status from speed if Firebase sends a generic value
        status: Number(livePayload.speed || 0) === 0 ? "stationary" : "moving",
        timestamp: incomingTs ?? Date.now(),
      };

      setCurrentAnimal(animal);
      setSystemStatus("Receiving live GPS data");

      if (mapInstance.current && markerRef.current) {
        const pos = { lat: animal.lat, lng: animal.lng };
        updateMarkerPosition(pos, `${animal.animalId} - ${animal.status}`);
        mapInstance.current.setCenter(pos);
        if (mapInstance.current.getZoom() < 13) {
          mapInstance.current.setZoom(15);
        }

        infoWindowRef.current.setContent(`
          <div style="min-width:240px;padding:8px;">
            <h3 style="margin:0 0 8px 0;font-size:16px;">${animal.animalId}</h3>
            <p style="margin:4px 0;"><strong>Latitude:</strong> ${animal.lat.toFixed(6)}</p>
            <p style="margin:4px 0;"><strong>Longitude:</strong> ${animal.lng.toFixed(6)}</p>
            <p style="margin:4px 0;"><strong>Speed:</strong> ${animal.speed} km/h</p>
            <p style="margin:4px 0;"><strong>Status:</strong> ${animal.status}</p>
            <p style="margin:4px 0;"><strong>Time:</strong> ${formatDateTime(animal.timestamp)}</p>
          </div>
        `);
      }

      await saveTrackingSnapshot(animal);
      await evaluateGeofences(animal);
    }, (err) => {
      console.error("Firebase read error at /gps:", err);
      setSystemStatus("Firebase read failed: check Database URL and rules");
    });

    return () => unsub();
  }, [geofences]);

  /* =========================
     14) LIVE PATH LISTENER
  ========================= */
  useEffect(() => {
    const pathRef = ref(db, "gps/path");

    const unsub = onValue(pathRef, (snapshot) => {
      const data = snapshot.val() || {};
      const arr = Object.entries(data)
        .map(([key, value]) => ({ key, ...value }))
        .filter((item) => item.latitude != null && item.longitude != null && item.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp);

      // normalise to lat/lng for polyline
      const normalised = arr.map((p) => ({ ...p, lat: Number(p.latitude), lng: Number(p.longitude) }));
      setPathPoints(normalised);

      if (pathPolylineRef.current) {
        const path = normalised.map((p) => ({ lat: p.lat, lng: p.lng }));
        pathPolylineRef.current.setPath(path);
      }
    });

    return () => unsub();
  }, []);

  /* =========================
     15) RECENT 10 HISTORY
  ========================= */
  useEffect(() => {
    const historyQuery = query(
      ref(db, "gps/history"),
      orderByChild("timestamp"),
      limitToLast(10)
    );

    const unsub = onValue(historyQuery, (snapshot) => {
      const data = snapshot.val() || {};
      const arr = Object.entries(data)
        .map(([key, value]) => ({
          key,
          ...value,
          lat: Number(value.latitude || 0),
          lng: Number(value.longitude || 0),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setHistory(arr);
    });

    return () => unsub();
  }, []);

  /* =========================
     16) RECENT ALERTS
  ========================= */
  useEffect(() => {
    const alertQuery = query(
      ref(db, "gps/alerts"),
      orderByChild("timestamp"),
      limitToLast(10)
    );

    const unsub = onValue(alertQuery, (snapshot) => {
      const data = snapshot.val() || {};
      const arr = Object.entries(data)
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setAlerts(arr);
    });

    return () => unsub();
  }, []);

  /* =========================
     17) ZONE STATS
  ========================= */
  useEffect(() => {
    const statsRef = ref(db, "gps/zoneStats");

    const unsub = onValue(statsRef, (snapshot) => {
      setZoneStats(snapshot.val() || {});
    });

    return () => unsub();
  }, []);

  const topVisitedZones = useMemo(() => {
    return Object.entries(zoneStats)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 5);
  }, [zoneStats]);

  // Distance from user to animal in metres
  const userAnimalDistance = useMemo(() => {
    if (!currentUserLocation || !currentAnimal) return null;
    return Math.round(
      haversineDistance(
        currentUserLocation.lat, currentUserLocation.lng,
        currentAnimal.lat, currentAnimal.lng
      )
    );
  }, [currentUserLocation, currentAnimal]);

  // Show proximity alert when animal is within thresholds
  useEffect(() => {
    if (userAnimalDistance === null) return;
    const prev = prevDistanceRef.current;

    const thresholds = [200, 500, 1000];
    for (const t of thresholds) {
      const crossedNow = userAnimalDistance <= t;
      const wasOutside = prev === null || prev > t;
      if (crossedNow && wasOutside) {
        const alertObj = {
          type: "PROXIMITY",
          level: t <= 200 ? "HIGH" : t <= 500 ? "HIGH" : "MEDIUM",
          animalId: currentAnimal?.animalId || "ANIMAL_01",
          zoneName: "Your Location",
          zoneType: "proximity",
          distance: userAnimalDistance,
          timestamp: Date.now(),
          message: `Animal is ${userAnimalDistance} m from your current location!`,
        };
        showPopup(alertObj);
        saveAlertToFirebase(alertObj);
        break;
      }
    }
    prevDistanceRef.current = userAnimalDistance;
  }, [userAnimalDistance]);

  // Place / update blue "You" marker on the map
  useEffect(() => {
    if (!mapLoaded || !currentUserLocation || !window.google) return;
    const pos = { lat: currentUserLocation.lat, lng: currentUserLocation.lng };
    if (!userMarkerRef.current) {
      userMarkerRef.current = new window.google.maps.Marker({
        map: mapInstance.current,
        position: pos,
        title: "Your Location",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2.5,
        },
        zIndex: 10,
      });
    } else {
      userMarkerRef.current.setPosition(pos);
    }
  }, [currentUserLocation, mapLoaded]);

  const radarModel = useMemo(() => {
    // Center the radar on the USER's current device GPS.
    // Geofence zones and animal are positioned relative to user.
    const center = currentUserLocation
      ? { lat: currentUserLocation.lat, lng: currentUserLocation.lng }
      : currentAnimal
      ? { lat: currentAnimal.lat, lng: currentAnimal.lng }
      : {
          lat: geofences.reduce((s, z) => s + z.center.lat, 0) / geofences.length,
          lng: geofences.reduce((s, z) => s + z.center.lng, 0) / geofences.length,
        };

    // Scale: use the animal distance from user + 20% padding.
    // Minimum 300m so radar always shows meaningful area.
    // Geofence zones are positioned relative to this scale — if they're
    // farther than the scale they'll be clamped to edge in Radar.jsx.
    const animalRange = currentAnimal
      ? haversineDistance(center.lat, center.lng, currentAnimal.lat, currentAnimal.lng)
      : 0;

    // Include nearest geofence in scale so zones appear inside radar, not all at edge.
    // Use the nearest zone center distance as a candidate for the scale.
    const nearestZoneDist = geofences.length > 0
      ? Math.min(...geofences.map((z) =>
          haversineDistance(center.lat, center.lng, z.center.lat, z.center.lng)
        ))
      : 0;

    // Scale = enough to show: animal position + nearest geofence center + 20% margin
    const maxDistanceMeters = Math.max(300, animalRange * 1.5, nearestZoneDist * 1.3);

    const zones = geofences.map((z) => {
      const p = toRadarXY(center, z.center, maxDistanceMeters);
      const distFromCenter = haversineDistance(center.lat, center.lng, z.center.lat, z.center.lng);
      return { ...z, ...p, distFromCenter: Math.round(distFromCenter) };
    });

    const blips = currentAnimal
      ? [
          {
            ...currentAnimal,
            ...toRadarXY(center, { lat: currentAnimal.lat, lng: currentAnimal.lng }, maxDistanceMeters),
            color: "#10b981",
            icon: "\ud83d\udc2f",
            distanceMeters: userAnimalDistance,
          },
        ]
      : [];

    return { zones, blips, maxDistanceMeters };
  }, [geofences, currentAnimal, currentUserLocation, userAnimalDistance]);

  const radarSize = useMemo(() => {
    // Cap radar size to always fit inside the card.
    // On desktop a 3-col grid card is roughly (viewport - padding) / 3.
    // Use a safe fraction so it never overflows.
    const maxFromViewport = Math.floor((viewportWidth - 120) / 3);
    const capped = Math.min(maxFromViewport, 400);
    if (viewportWidth <= 420) return Math.min(capped, 210);
    if (viewportWidth <= 768) return Math.min(capped, 260);
    if (viewportWidth <= 1024) return Math.min(capped, 310);
    return Math.max(260, capped);
  }, [viewportWidth]);

  const mapHeight = useMemo(() => {
    if (viewportWidth <= 420) return 300;
    if (viewportWidth <= 768) return 360;
    if (viewportWidth <= 1024) return 430;
    return 520;
  }, [viewportWidth]);

  // Re-trigger Google Maps resize whenever the map height changes or map first loads
  useEffect(() => {
    if (!mapLoaded || !mapInstance.current) return;
    window.google.maps.event.trigger(mapInstance.current, "resize");
    const center = currentAnimal
      ? { lat: currentAnimal.lat, lng: currentAnimal.lng }
      : { lat: 12.9716, lng: 77.5946 };
    mapInstance.current.setCenter(center);
  }, [mapHeight, mapLoaded]);

  return (
    <div style={styles.app} className="appRoot">
      <style>{responsiveCss}</style>

      {popup && (
        <div style={styles.popupWrap} className="popupWrap">
          <div style={styles.popup} className="popupCard">
            <div style={styles.popupHeader}>
              <span>Live Alert</span>
              <button style={styles.popupClose} onClick={() => setPopup(null)}>×</button>
            </div>
            <div style={styles.popupBody}>
              <div style={styles.badge(popup.level)}>{popup.level}</div>
              <h3 style={{ margin: "10px 0 8px" }}>{popup.type} - {popup.zoneName}</h3>
              <p style={styles.popupText}>{popup.message}</p>
              <p style={styles.popupMeta}>Animal ID: {popup.animalId}</p>
              <p style={styles.popupMeta}>Time: {formatDateTime(popup.timestamp)}</p>
              {popup.dwellTimeMs ? (
                <p style={styles.popupMeta}>Stayed: {formatDuration(popup.dwellTimeMs)}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Automated Wildlife Migration Tracking and Alert System</h1>
          {/* <p style={styles.subtitle}>
            Live GPS tracking, geofencing alerts, migration path monitoring, and risk-zone analysis
          </p> */}
        </div>
        <div style={styles.statusBox}>
          <span style={styles.statusDot}></span>
          {systemStatus}
        </div>
      </header>

      <section style={styles.heroGrid} className="heroGrid">
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Current Animal Status</h2>
          <div style={styles.statsGrid} className="statsGrid">
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Animal ID</div>
              <div style={styles.statValue}>{currentAnimal?.animalId || "-"}</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Latitude</div>
              <div style={styles.statValue}>
                {currentAnimal?.lat != null ? Number(currentAnimal.lat).toFixed(6) : "-"}
              </div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Longitude</div>
              <div style={styles.statValue}>
                {currentAnimal?.lng != null ? Number(currentAnimal.lng).toFixed(6) : "-"}
              </div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Speed</div>
              <div style={styles.statValue}>{currentAnimal?.speed ?? "-"} km/h</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Status</div>
              <div style={styles.statValue}>{currentAnimal?.status || "-"}</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statLabel}>Last Update</div>
              <div style={styles.statValue}>
                {currentAnimal?.timestamp ? formatDateTime(currentAnimal.timestamp) : "-"}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Current Zone Condition</h2>
          {currentZoneSummary.length === 0 ? (
            <div style={{ color: "#2e7d32", fontWeight: 700 }}>Animal is outside sensitive geofence zones</div>
          ) : (
            currentZoneSummary.map((zone) => (
              <div key={zone.id} style={styles.zoneRow}>
                <div>
                  <div style={styles.zoneName}>{zone.name}</div>
                  <div style={styles.zoneType}>{zone.type}</div>
                </div>
                <div style={styles.zoneDistance}>{zone.distance} m</div>
              </div>
            ))
          )}

          {/* Distance to animal */}
          <div style={styles.distanceBox}>
            <div style={styles.distanceLabel}>📍 Distance from You to Animal</div>
            <div style={styles.distanceValue}>
              {userAnimalDistance !== null
                ? userAnimalDistance >= 1000
                  ? `${(userAnimalDistance / 1000).toFixed(2)} km`
                  : `${userAnimalDistance} m`
                : currentUserLocation
                ? "Waiting for animal GPS..."
                : "Enable device location for distance"}
            </div>
            {currentUserLocation && (
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: 4 }}>
                Your GPS: {currentUserLocation.lat.toFixed(5)}, {currentUserLocation.lng.toFixed(5)}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={styles.smallTitle}>Path Summary</div>
            <div style={styles.miniStats}>
              <span>Total Path Points: {pathPoints.length}</span>
              <span>Total Alerts: {alerts.length}</span>
              <span>Configured Geofences: {geofences.length}</span>
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, overflow: "hidden" }}>
          <h2 style={styles.cardTitle}>Live Radar</h2>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden", padding: 4 }} className="radarWrap">
            <Radar
              size={radarSize}
              zones={radarModel.zones}
              blips={radarModel.blips}
            />
          </div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: "12px", color: "#9ca3af" }}>
            � = your location (centre) &nbsp;•&nbsp; 🐯 = animal GPS &nbsp;•&nbsp; rings = geofence zones
          </div>
        </div>
      </section>

      <section style={styles.mapSection}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Live Migration Map</h2>
          <div ref={mapWrapperRef} style={styles.mapWrapper}>
            <div ref={mapRef} style={{ width: "100%", height: `${mapHeight}px` }}></div>
          </div>
          {mapError ? <div style={styles.mapError}>{mapError}</div> : null}
        </div>
      </section>

      <section style={styles.bottomGrid} className="bottomGrid">
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Recent 10 Tracking History</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Animal</th>
                  <th style={styles.th}>Latitude</th>
                  <th style={styles.th}>Longitude</th>
                  <th style={styles.th}>Speed</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan="5">No history available</td>
                  </tr>
                ) : (
                  history.map((row) => (
                    <tr key={row.key}>
                      <td style={styles.td}>{formatDateTime(row.timestamp)}</td>
                      <td style={styles.td}>{row.animalId}</td>
                      <td style={styles.td}>{Number(row.lat).toFixed(6)}</td>
                      <td style={styles.td}>{Number(row.lng).toFixed(6)}</td>
                      <td style={styles.td}>{row.speed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Recent Alerts</h2>
          <div style={styles.alertList}>
            {alerts.length === 0 ? (
              <div style={styles.emptyBox}>No alerts triggered yet</div>
            ) : (
              alerts.map((a) => (
                <div key={a.key} style={styles.alertItem}>
                  <div style={styles.badge(a.level)}>{a.level}</div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.alertTitle}>{a.type} - {a.zoneName}</div>
                    <div style={styles.alertText}>{a.message}</div>
                    <div style={styles.alertTime}>{formatDateTime(a.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section style={styles.bottomGrid} className="bottomGrid">
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Frequently Visited Zones</h2>
          {topVisitedZones.length === 0 && currentZoneSummary.length === 0 ? (
            <div style={styles.emptyBox}>No zone visits recorded yet</div>
          ) : (
            <>
              {/* Live: zones animal is currently inside */}
              {currentZoneSummary.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, marginBottom: 6 }}>🟢 Currently Inside</div>
                  {currentZoneSummary.map((z) => (
                    <div key={z.id} style={{ ...styles.zoneRow, borderColor: z.color, borderWidth: 2 }}>
                      <div>
                        <div style={styles.zoneName}>{z.name}</div>
                        <div style={styles.zoneType}>{z.type}</div>
                      </div>
                      <div style={{ ...styles.zoneDistance, color: z.color }}>{z.distance} m</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Historical visit counts from Firebase */}
              {topVisitedZones.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>📊 All-time Visits</div>
                  {topVisitedZones.map((z) => (
                    <div key={z.id} style={styles.zoneRow}>
                      <div>
                        <div style={styles.zoneName}>{z.name}</div>
                        <div style={styles.zoneType}>{z.type}</div>
                      </div>
                      <div style={styles.zoneCount}>{z.count || 0} visits</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* <div style={styles.card}>
          <h2 style={styles.cardTitle}>System Analysis Output</h2>
          <div style={styles.analysisBox}>
            <p><strong>Repeated Movement Pattern:</strong> Computed from saved GPS path and repeated zone entry counts.</p>
            <p><strong>Conflict Area Identification:</strong> Zones with more entry frequency are treated as higher-risk animal-human conflict areas.</p>
            <p><strong>Planning Support:</strong> Stored location, alert, and zone data can be used later for migration route studies and forest planning.</p>
            <p><strong>Recommended Next Step:</strong> Add multiple animals with unique IDs and enable SMS/WhatsApp/email warning integration.</p>
          </div>
        </div> */}
      </section>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f4f7fb",
    color: "#0f172a",
    fontFamily: "Inter, Arial, sans-serif",
    padding: "18px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(16px, 4vw, 28px)",
    lineHeight: 1.3,
    color: "#0b3d91",
    wordBreak: "break-word",
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#475569",
    fontSize: "14px",
  },
  statusBox: {
    background: "#fff",
    borderRadius: "12px",
    padding: "10px 14px",
    boxShadow: "0 4px 18px rgba(15,23,42,0.08)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 600,
    fontSize: "13px",
    flexShrink: 0,
    maxWidth: "100%",
    wordBreak: "break-word",
  },
  statusDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#16a34a",
    display: "inline-block",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    marginBottom: "18px",
  },
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    marginTop: "16px",
  },
  mapSection: {
    marginBottom: "18px",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "18px",
    boxShadow: "0 6px 24px rgba(15,23,42,0.08)",
  },
  cardTitle: {
    margin: "0 0 14px",
    fontSize: "20px",
    color: "#0f172a",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
  },
  statItem: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "12px",
  },
  statLabel: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "6px",
  },
  statValue: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#0f172a",
    wordBreak: "break-word",
  },
  mapWrapper: {
    width: "100%",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    background: "#e8ecf0",
    overflow: "visible",
  },
  map: {
    width: "100%",
    display: "block",
  },
  distanceBox: {
    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
    border: "1.5px solid #93c5fd",
    borderRadius: "12px",
    padding: "12px 14px",
    marginTop: "14px",
  },
  distanceLabel: {
    fontSize: "12px",
    color: "#1e40af",
    fontWeight: 600,
    marginBottom: "4px",
  },
  distanceValue: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#1d4ed8",
  },
  mapError: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#9f1239",
    fontSize: "13px",
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: "13px",
    padding: "10px",
    background: "#eff6ff",
    color: "#1e3a8a",
    borderBottom: "1px solid #dbeafe",
  },
  td: {
    padding: "10px",
    fontSize: "13px",
    borderBottom: "1px solid #e5e7eb",
  },
  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  alertItem: {
    display: "flex",
    gap: "12px",
    padding: "12px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    alignItems: "flex-start",
  },
  alertTitle: {
    fontWeight: 700,
    marginBottom: "4px",
  },
  alertText: {
    color: "#475569",
    fontSize: "13px",
    marginBottom: "4px",
  },
  alertTime: {
    color: "#64748b",
    fontSize: "12px",
  },
  badge: (level) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "68px",
    padding: "6px 10px",
    borderRadius: "999px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    background:
      level === "HIGH"
        ? "#dc2626"
        : level === "MEDIUM"
        ? "#f59e0b"
        : "#16a34a",
  }),
  popupWrap: {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 9999,
  },
  popup: {
    width: "340px",
    background: "#fff",
    borderRadius: "16px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
    border: "1px solid #e2e8f0",
  },
  popupHeader: {
    background: "#0b3d91",
    color: "#fff",
    padding: "12px 16px",
    fontWeight: 700,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  popupClose: {
    border: "none",
    background: "transparent",
    color: "#fff",
    fontSize: "24px",
    cursor: "pointer",
    lineHeight: 1,
  },
  popupBody: {
    padding: "16px",
  },
  popupText: {
    margin: "0 0 8px",
    color: "#334155",
    fontSize: "14px",
  },
  popupMeta: {
    margin: "4px 0",
    color: "#64748b",
    fontSize: "13px",
  },
  zoneRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#fafafa",
    marginBottom: "10px",
  },
  zoneName: {
    fontWeight: 700,
    color: "#0f172a",
  },
  zoneType: {
    fontSize: "12px",
    color: "#64748b",
    marginTop: "4px",
    textTransform: "capitalize",
  },
  zoneDistance: {
    fontWeight: 700,
    color: "#b45309",
  },
  zoneCount: {
    fontWeight: 700,
    color: "#0b3d91",
  },
  analysisBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
    lineHeight: 1.7,
    color: "#334155",
    fontSize: "14px",
  },
  smallTitle: {
    fontWeight: 700,
    marginBottom: "8px",
  },
  miniStats: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#475569",
    fontSize: "14px",
  },
  emptyBox: {
    padding: "16px",
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    borderRadius: "12px",
    color: "#64748b",
  },
};

const responsiveCss = `
  *, *::before, *::after { box-sizing: border-box; }

  body { overflow-x: hidden; }

  /* ── Tablet ─────────────────────────────────────── */
  @media (max-width: 1024px) {
    .heroGrid, .bottomGrid {
      grid-template-columns: 1fr !important;
    }
    .statsGrid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }

  /* ── Mobile ─────────────────────────────────────── */
  @media (max-width: 768px) {
    .appRoot {
      padding: 10px !important;
    }
    .appRoot > header {
      flex-direction: column !important;
      align-items: stretch !important;
    }
    .heroGrid, .bottomGrid {
      grid-template-columns: 1fr !important;
      gap: 10px !important;
    }
    .heroGrid > div, .bottomGrid > div, .mapSection > div {
      padding: 12px !important;
      border-radius: 12px !important;
    }
    .radarWrap {
      padding: 2px !important;
    }
    .statsGrid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }

  /* ── Small mobile ────────────────────────────────── */
  @media (max-width: 480px) {
    .statsGrid {
      grid-template-columns: 1fr 1fr !important;
    }
    .popupWrap {
      right: 8px !important;
      left: 8px !important;
      top: 10px !important;
    }
    .popupCard {
      width: 100% !important;
    }
  }

  .tableWrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  table {
    min-width: 520px;
  }
`;

export default App;