import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-functions.js";

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyBQPqbtlfHPLpB-JYbyxDZiugu4NqwpSeM",
  authDomain: "askkhonsu-map.firebaseapp.com",
  projectId: "askkhonsu-map",
  storageBucket: "askkhonsu-map.appspot.com",
  messagingSenderId: "266031876218",
  appId: "1:266031876218:web:ec93411f1c13d9731e93c3",
  measurementId: "G-Z7F4NJ4PHW"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function renderData() {
  showLoading();

  const params = new URLSearchParams(window.location.search);
  const encodedEmail = params.get("id") || params.get("userId");
  const userEmail = encodedEmail ? decodeURIComponent(encodedEmail) : null;

  if (!userEmail) {
    showError("No user id detected in URL.");
    return;
  }

  const userObj = await getDataById(`user-${userEmail}`);
  if (!userObj) {
    showError(`No data found for ${userEmail}`);
    return;
  }

  if (!userObj.savedAttractions) {
    showError(`No saved itinerary found for ${userEmail}`);
    return;
  }

  let attractionLocations, hotelName, arrival, departure, preliminaryStr = '';

  try {
    const { tripName,
    				travelDates,
    				hotel, 
            arrivalAirport, 
            departureAirport, 
            savedAttractions } = userObj;
		
    preliminaryStr += `${tripName}'s Trip To N.Y.C.\n`;
    localStorage['ak-tripName'] = tripName;

    const titleDatesStr = processTitleDates(travelDates);
    preliminaryStr += `${titleDatesStr ? titleDatesStr + '\n\n' : ''}`;
    
    if (hotel) {
      hotelName = parseJSON(hotel)?.displayName;
      preliminaryStr += `Hotel\n${hotelName || ''}\n\n`;
    }
    if (arrivalAirport) {
      arrival = parseJSON(arrivalAirport)?.displayName;
      preliminaryStr += `Arrival Location\n${arrival || ''}\n\n`;
    }
    if (departureAirport) {
      departure = parseJSON(departureAirport)?.displayName;
      preliminaryStr += `Departure Location\n${departure || ''}\n\n`;
    }
            
    attractionLocations = parseJSON(savedAttractions);
  } 
  catch (err) {
    console.error("Error parsing savedAttractions JSON:", err);
    showError(`Itinerary data for ${userEmail} is invalid or corrupted.`);
    return;
  }

  if (!attractionLocations || typeof attractionLocations !== "object" || Object.keys(attractionLocations).length === 0) {
    showError(`Please add at least one attraction to your itinerary before exporting.`);
    return;
  }

  currentTrip = transformFirebaseData(userObj);

  if (currentTrip.days.length === 0) {
    showError(`Please add at least one attraction to your itinerary before exporting.`);
    return;
  }
}

let currentTrip = null;

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

  const attractions = savedAttractions ? (parseJSON(savedAttractions) || {}) : {};
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

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

async function handleExportMap() {
  // 1. Get trip data
  const tripData = currentTrip;

  if (!tripData) {
    showToast('Itinerary is still loading. Please wait and try again.');
    return;
  }

  // 2. Validate
  const totalActivities = tripData.days.reduce((sum, d) => sum + d.activities.length, 0);
  if (totalActivities === 0) {
    showToast('Add activities to your itinerary before exporting.');
    return;
  }

  if (tripData.days.length > 20) {
    showToast('Your trip is over 20 days — Google My Maps has a 10 layer limit, so only Days 1–20 will appear.');
  }

  // 3. Loading state
  const btn = document.getElementById('export-kml');
  btn.disabled = true;
  btn.textContent = 'Generating map...';

  try {
    // 4. Resolve missing lat/lng
    const resolvedTripData = await resolveAllLatLng(tripData);

    // 5. Generate and download
    await generateAndDownloadKmz(resolvedTripData);

    // 6. Open Google My Maps and prompt user to import
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

window.handleExportMap = handleExportMap;

// --- Callable function wrapper ---
async function getDataById(userId) {
  const getUserData = httpsCallable(functions, "getUserData");
  try {
    const res = await getUserData({ userId });
    const { data } = res;
    return data.user;
  } catch (err) {
    if (err.code && err.message) {
      console.error(`❌ Firebase error [${err.code}]: ${err.message}`);
      showError(`Error: ${err.message}`);
    } else {
      console.error("❌ Unexpected error:", err);
      showError("Something went wrong while fetching user data.");
    }
    return null;
  }
}

// --- Helpers ---
function showLoading(msg = "Loading itinerary...") {
  $itineraryWrap.classList.add("loading");
  $itineraryWrap.classList.remove("error");
  $downloadBtn.classList.add("disable");

  // Clear content first
  $itineraryWrap.textContent = "";

  // Spinner element
  const spinner = document.createElement("div");
  spinner.className = "ak-spinner";

  const text = document.createElement("span");
  text.textContent = msg;

  $itineraryWrap.appendChild(spinner);
  $itineraryWrap.appendChild(text);
}

function showError(msg) {
  console.error("❌", msg);
  $itineraryWrap.textContent = msg;
  $itineraryWrap.classList.add("error");
  $itineraryWrap.classList.remove("loading");
  $downloadBtn.classList.add("disable");

  // Retry button
  const retryBtn = document.createElement("button");
  retryBtn.textContent = "Retry";
  retryBtn.className = "ak-retry-btn";
  retryBtn.onclick = () => {
    retryBtn.remove();
    renderData();
  };
  $itineraryWrap.appendChild(document.createElement("br"));
  $itineraryWrap.appendChild(retryBtn);
}

function processTitleDates(date) {
  const theDate = parseJSON(date);
  if (!theDate) return;
  const { dateStr, flatpickrDate } = theDate;
  const dateToExtractFrom = dateStr ? dateStr : flatpickrDate;
  const [ startDate, endDate ] = dateToExtractFrom.split(/\s+to\s+/);
  return getTitleDates(startDate, endDate);
}

function getTitleDates(startDate, endDate) {
  const monthArr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
  let titleStartDate = new Date(startDate);
  let titleEndDate = new Date(endDate);
  titleStartDate = `${monthArr[titleStartDate.getMonth()]} ${titleStartDate.getDate()}`;
  titleEndDate = `${monthArr[titleEndDate.getMonth()]} ${titleEndDate.getDate()}`;

  const sameDay = titleStartDate === titleEndDate;
  const titleDates = sameDay ? titleStartDate : `${titleStartDate} - ${titleEndDate}`;
  return titleDates;
}

function parseJSON(jsonStr) {
  let jsonObj = null;

  try {
    jsonObj = JSON.parse(jsonStr);
  }
  catch (e) {
      return null;
  }

  return jsonObj;
}