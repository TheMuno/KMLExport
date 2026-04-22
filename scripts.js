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
    showError(`Itinerary for ${userEmail} is empty.`);
    return;
  }
}

// Mock trip data — replace with Firebase fetch when implemented
const currentTrip = {
  userName: localStorage['ak-tripName'] || 'User',
  tripDates: { start: "2026-07-15", end: "2026-07-16" },
  hotel: {
    name: "The Lucerne Hotel",
    lat: 40.7829,
    lng: -73.9765
  },
  days: [
    {
      dayNumber: 1,
      activities: [
        {
          name: "American Museum of Natural History",
          type: "attraction",
          place_id: "ChIJCXoPsPBYwokR3GcGHlKL68I",
          lat: 40.7813,
          lng: -73.9740,
          time: "10:00 AM"
        },
        {
          name: "Shake Shack - Upper West Side",
          type: "restaurant",
          place_id: "ChIJj2Mv6PBYwokRRBaOoKmHELQ",
          lat: 40.7812,
          lng: -73.9810,
          time: "12:30 PM"
        },
        {
          name: "Central Park",
          type: "park",
          place_id: "ChIJ4zGFAZpYwokRGUGph3Mf37k",
          lat: 40.7851,
          lng: -73.9683,
          time: "2:00 PM"
        }
      ]
    },
    {
      dayNumber: 2,
      activities: [
        {
          name: "The Metropolitan Museum of Art",
          type: "attraction",
          place_id: "ChIJb8Jg9pZYwokR-qHnxoHF-tg",
          lat: 40.7794,
          lng: -73.9632,
          time: "10:00 AM"
        },
        {
          name: "Sarabeth's Central Park South",
          type: "restaurant",
          place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          lat: 40.7659,
          lng: -73.9772,
          time: "1:00 PM"
        },
        {
          name: "Fifth Avenue Shopping",
          type: "shopping",
          place_id: "ChIJj3jAGKtZwokRDMmJMJgBMPs",
          lat: 40.7580,
          lng: -73.9855,
          time: "3:00 PM"
        }
      ]
    }
  ]
};

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

async function handleExportMap() {
  // 1. Get trip data
  const tripData = currentTrip;

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