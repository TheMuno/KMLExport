const $attractionsWrap = document.querySelector('[data-ak="attractions-wrap"]');

// Same Places API (New) key & REST pattern customize-itinerary_dev.js uses for searchNearby
const PLACES_API_KEY = 'AIzaSyCMmi6kGAOGfMzK4CBvNiVBB7T6OjGbsU4';
const PLACE_DETAILS_FIELDS = 'id,displayName,editorialSummary,types,addressComponents,formattedAddress,rating,websiteUri,nationalPhoneNumber,userRatingCount,photos';

restoreSavedSelections();

function restoreSavedSelections() {
  const saved = localStorage['ak-attractions-saved'];
  if (!saved) return;
  const attractions = JSON.parse(saved)?.slide1?.attractions || [];
  const savedNames = new Set(attractions.map(a => a.displayName.toLowerCase().trim()));

  let anyChecked = false;
  $attractionsWrap?.querySelectorAll('input[type="checkbox"]').forEach($input => {
    const name = ($input.getAttribute('data-name') || '').toLowerCase().trim();
    if (!savedNames.has(name)) return;
    $input.checked = true;
    $input.closest('label')?.querySelector('.w-checkbox-input')?.classList.add('w--redirected-checked');
    anyChecked = true;
  });

  if (anyChecked) document.querySelector('[data-ak="attractions"] .formicon_wrap')?.click();
}

if ($attractionsWrap) {
  $attractionsWrap.addEventListener('change', e => {
    const $checkbox = e.target.closest('input[type="checkbox"]');
    if (!$checkbox) return;
    saveSelectedAttractions();
  });
}

async function saveSelectedAttractions() {
  const checked = [...$attractionsWrap.querySelectorAll('input[type="checkbox"]:checked')];
  const allCheckboxNames = new Set(
    [...$attractionsWrap.querySelectorAll('input[type="checkbox"]')]
      .map($input => ($input.getAttribute('data-name') || $input.name.replace(/-/g, ' ')).toLowerCase().trim())
  );

  const existing = localStorage['ak-attractions-saved'] ? JSON.parse(localStorage['ak-attractions-saved']) : {};
  const existingSlide1 = existing.slide1 || {};
  const existingAttractions = existingSlide1.attractions || [];
  const existingByName = new Map(existingAttractions.map(a => [a.displayName.toLowerCase().trim(), a]));

  const newAttractions = await Promise.all(checked.map(async $input => {
    const $label = $input.closest('label');
    const displayName = $input.getAttribute('data-name') || $input.name.replace(/-/g, ' ');
    const coordsRaw = $label?.getAttribute('coordinates') || '';
    const [latStr, lngStr] = coordsRaw.split(',');
    const lat = parseFloat(latStr?.trim());
    const lng = parseFloat(lngStr?.trim());
    const location = (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
    const placeId = $input.getAttribute('data-place-id') || $label?.getAttribute('data-place-id') || '';

    // Already enriched on a previous toggle (or saved elsewhere) — reuse it instead of refetching
    const cached = existingByName.get(displayName.toLowerCase().trim());
    if (cached && cached.placeId === placeId && (cached.address || cached.neighborhood)) {
      return { ...cached, displayName, placeId, location: location || cached.location };
    }

    const details = placeId ? await fetchPlaceDetails(placeId) : null;

    return {
      location,
      displayName,
      neighborhood: details?.neighborhood || '',
      address: details?.address || '',
      editorialSummary: details?.editorialSummary || null,
      type: details?.type?.length ? details.type : ['tourist_attraction'],
      placeId,
      rating: details?.rating ?? null,
      website: details?.website || '',
      phone: details?.phone || '',
      reviewCount: details?.reviewCount ?? null,
      photoUrl: details?.photoUrl || '',
    };
  }));

  // Preserve attractions added elsewhere (e.g. via autocomplete) that aren't in this page's checkbox set
  const otherAttractions = existingAttractions.filter(
    a => !allCheckboxNames.has(a.displayName.toLowerCase().trim())
  );

  // Merge: others first, then newly checked — deduplicated by displayName
  const combined = [...new Map(
    [...otherAttractions, ...newAttractions].map(a => [a.displayName.toLowerCase().trim(), a])
  ).values()];

  const savedAttractions = {
    ...existing,
    slide1: {
      ...existingSlide1,
      attractions: combined,
      restaurants: existingSlide1.restaurants || [],
      notes: existingSlide1.notes || [],
    }
  };

  localStorage['ak-attractions-saved'] = JSON.stringify(savedAttractions);
  localStorage['ak-update-attractions'] = true;
}

async function fetchPlaceDetails(placeId) {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELDS,
      },
    });
    if (!res.ok) return null;
    const place = await res.json();

    return {
      neighborhood: extractNeighborhoodFromComponents(place.addressComponents || []),
      address: place.formattedAddress || '',
      editorialSummary: place.editorialSummary || null,
      type: place.types || [],
      rating: place.rating ?? null,
      website: place.websiteUri || place.websiteURI || '',
      phone: place.nationalPhoneNumber || '',
      reviewCount: place.userRatingCount ?? null,
      photoUrl: place.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=800&key=${PLACES_API_KEY}`
        : '',
    };
  } catch (_) {
    return null;
  }
}

function extractNeighborhoodFromComponents(addressComponents) {
  const find = (...types) => addressComponents.find(c => types.some(t => c.types.includes(t)))?.longText;
  const findLast = (...types) => addressComponents.findLast(c => types.some(t => c.types.includes(t)))?.longText;
  return findLast('neighborhood') || find('sublocality', 'sublocality_level_1') || find('locality') || '';
}
