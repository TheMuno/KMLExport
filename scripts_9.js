let currentTrip = null;

const $googleMapsBtn = document.querySelector('[data-ak="download-google-maps-btn"]');
$googleMapsBtn.addEventListener('click', e => {
  e.preventDefault();
  const userObj = parseJSON(localStorage['ak-user-db-object'] || '{}');
  if (initTrip(userObj)) handleExportMap();
});

function initTrip(userObj) {
  
  // console.log('localStorage', localStorage)
  // console.log("localStorage['ak-user-db-object']", localStorage['ak-user-db-object'])
  // console.log('')
  // console.log('userObj?.savedAttractions', userObj?.savedAttractions)
  
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
  return true;
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

  // const btn = document.getElementById('export-kml');
  $googleMapsBtn.disabled = true;
  $googleMapsBtn.textContent = 'Generating map...';

  try {
    const resolvedTripData = await resolveAllLatLng(currentTrip);
    await generateAndDownloadKmz(resolvedTripData);
    window.open('https://www.google.com/maps/d/', '_blank');
    showToast('✓ Map downloaded! In the My Maps tab, click Create > Import to open it.');
  } catch (err) {
    console.error('KML export failed:', err);
    showToast('Something went wrong. Please try again.');
  } finally {
    $googleMapsBtn.disabled = false;
    $googleMapsBtn.textContent = '📍 Export Map';
  }
}

/*function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}*/

function parseJSON(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// window.initTrip = initTrip;
// window.handleExportMap = handleExportMap;

// ✅ SweetAlert2 Modals and Toasts
function showModal({ title = '', text = '', icon = 'info', confirmText = 'OK', timer = null }) {
  Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: confirmText,
    background: '#fff',
    color: '#333',
    confirmButtonColor: '#FF4500', // brand 
    showClass: {
      popup: 'animate__animated animate__fadeInDown'
    },
    hideClass: {
      popup: 'animate__animated animate__fadeOutUp'
    },
    timer,
    timerProgressBar: !!timer
  });
}

function showSuccess(message) {
  showModal({
    title: 'Success!',
    text: message,
    icon: 'success',
    confirmText: 'Great!'
  });
}

function showWarning(message) {
  showModal({
    title: 'Notice',
    text: message,
    icon: 'warning',
    confirmText: 'OK'
  });
}

function showError(title, message) {
  showModal({
    title,
    text: message,
    icon: 'error',
    confirmText: 'Close'
  });
}

// 💬 Toast notifications
function showToast(message, icon = 'info') {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: message,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: '#1e1e1e',
    color: '#fff',
  });
}

// 🔄 Loading Indicator
function showLoading(message = 'Checking availability...') {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
    background: '#fff',
    color: '#333',
  });
}

// ✅ Close loading state
function closeLoading() {
  Swal.close();
}

