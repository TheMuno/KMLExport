(function () {
  let currentTrip = null;
  let $activeBtn = null;

  // Shared with download-guide.js/get-guide.js/stripe-purchase.js — guarded by
  // the same style id so whichever script runs first wins and the rest no-op.
  function injectPdfSpinnerStyle() {
    if (document.getElementById('ak-pdf-spinner-style')) return;
    const style = document.createElement('style');
    style.id = 'ak-pdf-spinner-style';
    style.textContent = `
      @keyframes ak-pdf-spin { to { transform: rotate(360deg); } }
      .ak-pdf-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: ak-pdf-spin 0.7s linear infinite;
        opacity: 0.8;
        flex-shrink: 0;
      }
      .ak-pdf-btn-loading {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  function initTrip(userObj) {
    if (!userObj?.savedAttractions) {
      showToast('Please add at least one attraction to your itinerary before exporting.');
      return;
    }

    const attractions = parseJSON(userObj.savedAttractions) || {};
    const hasAnyActivity = Object.values(attractions).some(slots =>
      [slots.attractions || slots.morning, slots.restaurants || slots.afternoon, slots.notes || slots.evening].some(s => Array.isArray(s) && s.length > 0)
    );

    if (!hasAnyActivity) {
      showToast('Please add at least one attraction to your itinerary before exporting.');
      return;
    }

    currentTrip = transformFirebaseData(userObj);
    return true;
  }

  function transformFirebaseData(userObj) {
    const { tripName, travelDates, hotel, arrivalAirport, departureAirport, savedAttractions } = userObj;

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

    let hotelData = null,
        arrivalAirportData = null,
        departureAirportData = null;
    if (hotel) {
      const h = parseJSON(hotel);
      if (h?.displayName && h?.location?.lat && h?.location?.lng) {
        hotelData = { name: h.displayName, lat: h.location.lat, lng: h.location.lng };
      }
    }

    if (arrivalAirport) {
      const a = parseJSON(arrivalAirport);
      if (a?.displayName && a?.location?.lat && a?.location?.lng) {
        arrivalAirportData = { name: a.displayName, lat: a.location.lat, lng: a.location.lng };
      }
    }

    if (departureAirport) {
      const a = parseJSON(departureAirport);
      if (a?.displayName && a?.location?.lat && a?.location?.lng) {
        departureAirportData = { name: a.displayName, lat: a.location.lat, lng: a.location.lng };
      }
    }

    const attractions = parseJSON(savedAttractions) || {};
    const days = Object.entries(attractions)
      .sort(([a], [b]) => slideNum(a) - slideNum(b))
      .map(([, slots], i) => ({
        dayNumber: i + 1,
        activities: [
          ...mapSlotActivities(slots.attractions || slots.morning, 'Morning', 'attraction'),
          ...mapSlotActivities(slots.restaurants || slots.afternoon, 'Afternoon', 'restaurant'),
          ...mapSlotActivities(slots.notes || slots.evening, 'Evening', 'local_experience'),
        ],
      }))
      .filter(day => day.activities.length > 0);

    return {
      userName,
      tripDates: { start: startDate, end: endDate },
      hotel: hotelData,
      arrivalAirport: arrivalAirportData,
      departureAirport: departureAirportData,
      days,
    };
  }

  function slideNum(key) {
    return parseInt(key.replace('slide', ''), 10) || 0;
  }

  function stripTimeTag(name) {
    return String(name || '').replace(/\s*\((morning|afternoon|evening)\)\s*$/i, '').trim();
  }

  function mapSlotActivities(slot, timeLabel, type) {
    if (!Array.isArray(slot)) return [];
    return slot.map(a => ({
      name: stripTimeTag(a.displayName),
      type,
      place_id: a.placeId,
      lat: a.location?.lat,
      lng: a.location?.lng,
      time: timeLabel,
    }));
  }

  // [data-ak="download-google-maps-btn"] is a Webflow component wrapper
  // (.btn_main_wrap carries the button's background/border) around a text
  // label ([data-ak="popup-action-label"]) — swapping the whole button's
  // innerHTML wipes .btn_main_wrap out, leaving a bare spinner+text with no
  // button chrome. Swap just the label instead so the chrome stays intact.
  function getLabelEl(btn) {
    return btn.querySelector('[data-ak="popup-action-label"]') || btn;
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

    injectPdfSpinnerStyle();

    const $label = getLabelEl($activeBtn);
    const originalHTML = $label.innerHTML;
    $activeBtn.disabled = true;
    $activeBtn.style.minWidth = `${$activeBtn.getBoundingClientRect().width}px`;
    $label.innerHTML = '<span class="ak-pdf-btn-loading"><span class="ak-pdf-spinner"></span>Creating Map...</span>';

    try {
      const resolvedTripData = await resolveAllLatLng(currentTrip);
      await generateAndDownloadKmz(resolvedTripData);
      // showToast('✓ Map downloaded! Import it at google.com/maps/d/ via Create > Import.');
    } catch (err) {
      console.error('KML export failed:', err);
      showToast('Something went wrong. Please try again.');
    } finally {
      $activeBtn.disabled = false;
      $activeBtn.style.minWidth = '';
      $label.innerHTML = originalHTML;
    }
  }

  window.akWireGoogleMapsBtn = function ($buttons) {
    if (!$buttons || !$buttons.length) return;
    let isLoading = false;

    $buttons.forEach(btn => {
      btn.addEventListener('click', e => {
        if (btn.classList.contains('is_mobile_only')) return;
        e.preventDefault();
        if (isLoading) return;
        $activeBtn = btn;
        // 'ak-user-db-object' is only ever populated by the public itinerary-list
        // share page — on this itinerary-maker flow the same fields live under
        // their own keys (mirrors build-itinerary.js's saveAttractionsDB()).
        const userObj = {
          tripName: localStorage['ak-user-name'] || '',
          travelDates: localStorage['ak-travel-days'] || '',
          hotel: localStorage['ak-hotel'] || '',
          arrivalAirport: localStorage['ak-arrival-airport'] || '',
          departureAirport: localStorage['ak-departure-airport'] || '',
          savedAttractions: localStorage['ak-attractions-saved'] || '',
        };
        if (initTrip(userObj)) {
          isLoading = true;
          $buttons.forEach(b => { b.disabled = true; });
          handleExportMap().finally(() => {
            isLoading = false;
            $buttons.forEach(b => { b.disabled = false; });
          });
        }
      });
    });
  };
})();

function parseJSON(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// ✅ Alertify Modals and Toasts
function showModal({ title = '', text = '', icon = 'info', confirmText = 'OK' }) {
  alertify.alert(title, text, () => {}).set('label', confirmText);
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
  const notify = { success: alertify.success, error: alertify.error, warning: alertify.warning }[icon] || alertify.message;
  notify.call(alertify, message, 3);
}

// 🔄 Loading Indicator
function injectAlertifyLoadingStyle() {
  if (document.getElementById('ak-alertify-loading-style')) return;
  const style = document.createElement('style');
  style.id = 'ak-alertify-loading-style';
  style.textContent = `
    @keyframes ak-alertify-spin { to { transform: rotate(360deg); } }
    body.ak-alertify-loading-active .ajs-footer { display: none; }
    body.ak-alertify-loading-active .ajs-dialog .ajs-message::before {
      content: '';
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      vertical-align: middle;
      border: 2px solid #e5e7eb;
      border-top-color: #111;
      border-radius: 50%;
      animation: ak-alertify-spin 0.7s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

let $loadingDialog = null;
function showLoading(message = 'Checking availability...') {
  injectAlertifyLoadingStyle();
  document.body.classList.add('ak-alertify-loading-active');
  $loadingDialog = alertify.alert(message).set({ closable: false, movable: false, resizable: false });
}

// ✅ Close loading state
function closeLoading() {
  $loadingDialog?.close();
  $loadingDialog = null;
  document.body.classList.remove('ak-alertify-loading-active');
}
