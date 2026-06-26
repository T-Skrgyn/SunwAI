export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;

  // Try Google first
  if (key) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=en&region=IN`
      );
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        // Get the most specific result
        const result = data.results[0];
        return result.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch {}
  }

  // Fallback to Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {}

  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function getLocation(): Promise<{ lat: number; lng: number; address: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        console.log("GPS coords:", lat, lng, "accuracy:", pos.coords.accuracy, "m");
        const address = await reverseGeocode(lat, lng);
        resolve({ lat, lng, address });
      },
      (err) => {
        console.error("Geolocation error:", err.code, err.message);
        resolve({ lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh" });
      },
      {
        enableHighAccuracy: true,  // ← forces GPS, not WiFi/cell
        timeout: 15000,
        maximumAge: 0,             // ← no cached location
      }
    );
  });
}