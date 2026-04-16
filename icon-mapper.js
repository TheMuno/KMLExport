const KHONSU_ORANGE_KML = 'ff3d85ff'; // #FF853D in KML AABBGGRR format

const ICON_MAP = {
  restaurant: 'http://maps.google.com/mapfiles/kml/shapes/dining.png',
  attraction: 'http://maps.google.com/mapfiles/kml/shapes/camera.png',
  hotel:      'http://maps.google.com/mapfiles/kml/shapes/lodging.png',
  airport:    'http://maps.google.com/mapfiles/kml/shapes/airports.png',
  shopping:   'http://maps.google.com/mapfiles/kml/shapes/shopping.png',
  park:       'http://maps.google.com/mapfiles/kml/shapes/parks.png'
};

const DEFAULT_ICON = 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png';

function getIconUrl(activityType) {
  return ICON_MAP[activityType] || DEFAULT_ICON;
}

function getKmlColor() {
  return KHONSU_ORANGE_KML;
}
