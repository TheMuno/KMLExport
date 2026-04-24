let currentTrip = null;

const userObj = parseJSON(localStorage['ak-user-db-object'] || '{}');
const $googleMapsBtn = document.querySelector('[data-ak="download-google-maps-btn"]');
$googleMapsBtn.addEventListener('click', e => {
  initTrip(userObj); 
});

function initTrip(userObj) {
  if (!userObj?.savedAttractions) {
    showToast('Please add at least one attraction to your itinerary before exporting.');
    return;
  }

  const attractions = parseJSON(userObj.savedAttractions) || {};
  const hasAnyActivity = Object.values(attractions).some(slots =>
    [slots.morning, slots.afternoon, slots.evening].some(s => Array.isArray(s) && s.length > 0)
  );

  if (!hasAnyActivity) {
    showToast('Please add at least one attraction to your itinerary before exporting.');
    return;
  }

  currentTrip = transformFirebaseData(userObj);
}

function transformFirebaseData(userObj) {
  const { tripName, travelDates, hotel, savedAttractions } = userObj;

  const userName = tripName || 'User';

  let startDate = '2026-01-01', endDate = '2026-01-02';
  if (travelDates) {
    const datesObj = parseJSON(travelDates);
    const dateStr = datesObj?.dateStr || datesObj?.flatpickrDate || '';
    if (dateStr) {
      const parts = dateStr.split(/\s+to\s+/);
      if (parts[0]) startDate = parts[0].trim();
      if (parts[1]) endDate = parts[1].trim();
    }
  }

  let hotelData = null;
  if (hotel) {
    const h = parseJSON(hotel);
    if (h?.displayName && h?.location?.lat && h?.location?.lng) {
      hotelData = { name: h.displayName, lat: h.location.lat, lng: h.location.lng };
    }
  }

  const attractions = parseJSON(savedAttractions) || {};
  const days = Object.entries(attractions)
    .sort(([a], [b]) => slideNum(a) - slideNum(b))
    .map(([, slots], i) => ({
      dayNumber: i + 1,
      activities: [
        ...mapSlotActivities(slots.morning, 'Morning', 'attraction'),
        ...mapSlotActivities(slots.afternoon, 'Afternoon', 'restaurant'),
        ...mapSlotActivities(slots.evening, 'Evening', 'local_experience'),
      ],
    }))
    .filter(day => day.activities.length > 0);

  return { userName, tripDates: { start: startDate, end: endDate }, hotel: hotelData, days };
}

function slideNum(key) {
  return parseInt(key.replace('slide', ''), 10) || 0;
}

function mapSlotActivities(slot, timeLabel, type) {
  if (!Array.isArray(slot)) return [];
  return slot.map(a => ({
    name: a.displayName,
    type,
    place_id: a.placeId,
    lat: a.location?.lat,
    lng: a.location?.lng,
    time: timeLabel,
  }));
}

async function handleExportMap() {
  if (!currentTrip) {
    showToast('No itinerary loaded yet.');
    return;
  }

  const totalActivities = currentTrip.days.reduce((sum, d) => sum + d.activities.length, 0);
  if (totalActivities === 0) {
    showToast('Add activities to your itinerary before exporting.');
    return;
  }

  if (currentTrip.days.length > 20) {
    showToast('Your trip is over 20 days — Google My Maps has a 10 layer limit, so only Days 1–20 will appear.');
  }

  const btn = document.getElementById('export-kml');
  btn.disabled = true;
  btn.textContent = 'Generating map...';

  try {
    const resolvedTripData = await resolveAllLatLng(currentTrip);
    await generateAndDownloadKmz(resolvedTripData);
    window.open('https://www.google.com/maps/d/', '_blank');
    showToast('✓ Map downloaded! In the My Maps tab, click Create > Import to open it.');
  } catch (err) {
    console.error('KML export failed:', err);
    showToast('Something went wrong. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = '📍 Export Map';
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function parseJSON(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

window.initTrip = initTrip;
window.handleExportMap = handleExportMap;
