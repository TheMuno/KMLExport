const KHONSU_ORANGE_KML = 'ff3d85ff'; // #FF853D in KML AABBGGRR format

const ICON_MAP = {
  restaurant:    'icons/restaurant.png',
  attraction:    'icons/camera.png',
  hotel:         'icons/hotel.png',
  airport:       'icons/airport.png',
  shopping:      'icons/shopping-cart.png',
  park:          'icons/outdoor_park.png',
  amusement_park:'icons/amusement_park.png'
};

const ICON_FILES = [
  'restaurant.png',
  'camera.png',
  'hotel.png',
  'airport.png',
  'shopping-cart.png',
  'outdoor_park.png',
  'amusement_park.png'
];

const DEFAULT_ICON = 'icons/camera.png';

function getIconUrl(activityType) {
  return ICON_MAP[activityType] || DEFAULT_ICON;
}

function getKmlColor() {
  return KHONSU_ORANGE_KML;
}
