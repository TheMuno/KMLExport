// Mock trip data — replace with Firebase fetch when implemented
const currentTrip = {
  userName: "Rob",
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

function initMap() {
  const newYork = { lat: 40.7128, lng: -74.0060 };
  const map = new google.maps.Map(document.getElementById('map'), {
    center: newYork,
    zoom: 12
  });
}
