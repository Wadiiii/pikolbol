export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const DEFAULT_CENTER = [122.0790, 6.9214];

export function createMap(container, options = {}) {
    const map = new maplibregl.Map({
        container: container,
        style: MAP_STYLE,
        center: options.center || DEFAULT_CENTER,
        zoom: options.zoom || 12,
        attributionControl: { compact: true }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    if (options.geolocate !== false) {
        map.addControl(new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: false
        }), 'top-right');
    }

    return map;
}

export function hasCoords(item) {
    return item && typeof item.lat === 'number' && typeof item.lng === 'number';
}

export function venuePin() {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'venue-pin';
    return pin;
}

export function fitToVenues(map, venues) {
    const points = venues.filter(hasCoords);
    if (!points.length) {
        return;
    }
    if (points.length === 1) {
        map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
        return;
    }
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((v) => bounds.extend([v.lng, v.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
}

export function distanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fmtDistance(km) {
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
}

export function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Location is not supported on this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            (error) => reject(new Error(error.code === 1
                ? 'Location permission was denied. Allow it in your browser settings.'
                : 'Could not get your location. Please try again.')),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}