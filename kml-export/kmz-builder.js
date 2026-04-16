const GOOGLE_PLACES_API_KEY = 'AIzaSyDM7Sbx3ogbiG0l_c-j7PJk4m1ivbddY4I';

async function generateAndDownloadKmz(tripData) {
  const kmlContent = buildKml(tripData);
  const fileName = buildFileName(tripData);

  const zip = new JSZip();
  zip.file('doc.kml', kmlContent);
  const kmzBlob = await zip.generateAsync({ type: 'blob' });

  triggerDownload(kmzBlob, fileName);
}

function buildFileName(tripData) {
  const name = (tripData.userName || 'trip').toLowerCase().replace(/\s+/g, '-');
  const d = new Date(tripData.tripDates.start);
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const year = d.getFullYear();
  return `${name}-nyc-trip-${month}-${year}.kmz`;
}

async function resolveLatLng(activity) {
  if (activity.lat && activity.lng) return activity;

  if (!activity.place_id) {
    console.warn(`No lat/lng or place_id for: ${activity.name}. Will skip.`);
    return activity;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${activity.place_id}&fields=geometry&key=${GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    return {
      ...activity,
      lat: data.result.geometry.location.lat,
      lng: data.result.geometry.location.lng
    };
  } catch (err) {
    console.warn(`Could not resolve lat/lng for ${activity.name}:`, err);
    return activity;
  }
}

async function resolveAllLatLng(tripData) {
  const resolvedDays = await Promise.all(
    tripData.days.map(async day => ({
      ...day,
      activities: await Promise.all(day.activities.map(resolveLatLng))
    }))
  );
  return { ...tripData, days: resolvedDays };
}
