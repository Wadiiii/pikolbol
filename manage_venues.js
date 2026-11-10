import { db, requireRole, escapeHtml, logActivity, friendlyError } from './app.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    writeBatch,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, statusBadge, showFlash } from './layout.js';
import { createMap, hasCoords, getUserLocation, DEFAULT_CENTER } from './map.js';

const profile = await requireRole(['super_admin']);
const page = renderLayout(profile, 'Venues', 'manage_venues.html');
const me = profile.firstName + ' ' + profile.lastName;

let venues = [];
let admins = [];
let courtCount = {};
let bookingCount = {};
let editingId = null;
let pickerMap = null;
let pickerMarker = null;

page.innerHTML = `
    <div id="no-admins"></div>
    <div class="grid-2 grid-form-wide">
        <section class="panel">
            <div class="panel-head">
                <h3>All venues</h3>
                <span class="panel-note" id="venue-total"></span>
            </div>
            <div id="venue-list"><div class="empty">Loading...</div></div>
        </section>

        <section class="panel form-panel" id="form-panel">
            <div class="panel-head">
                <h3 id="form-title">Add a venue</h3>
                <a href="#" class="panel-link" id="cancel-edit" hidden>Cancel</a>
            </div>
            <form class="panel-body" id="venue-form" novalidate>
                <div class="form-grid">
                    <div class="field">
                        <label for="adminId">Managed by</label>
                        <select id="adminId" name="adminId"></select>
                    </div>
                    <div class="field">
                        <label for="status">Status</label>
                        <select id="status" name="status">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="field span-2">
                        <label for="name">Venue name</label>
                        <input type="text" id="name" name="name" maxlength="100" required>
                    </div>
                    <div class="field">
                        <label for="address">Address</label>
                        <input type="text" id="address" name="address" maxlength="255" required>
                    </div>
                    <div class="field">
                        <label for="city">City</label>
                        <input type="text" id="city" name="city" maxlength="100" value="Zamboanga City" required>
                    </div>
                    <div class="field span-2">
                        <label>Location on map</label>
                        <div class="picker-map" id="picker-map"></div>
                        <div class="picker-actions">
                            <button type="button" class="btn btn-soft btn-sm" id="use-location">${icon('locate')}Use my location</button>
                            <span class="map-hint" id="picker-hint">Tap the map to place the pin, or drag it.</span>
                        </div>
                    </div>
                    <div class="field">
                        <label for="lat">Latitude</label>
                        <input type="text" id="lat" name="lat" inputmode="decimal" placeholder="6.9214">
                    </div>
                    <div class="field">
                        <label for="lng">Longitude</label>
                        <input type="text" id="lng" name="lng" inputmode="decimal" placeholder="122.0790">
                    </div>
                    <div class="field">
                        <label for="openingTime">Opens</label>
                        <input type="time" id="openingTime" name="openingTime" value="06:00" required>
                    </div>
                    <div class="field">
                        <label for="closingTime">Closes</label>
                        <input type="time" id="closingTime" name="closingTime" value="22:00" required>
                    </div>
                    <div class="field span-2">
                        <label for="contact">Contact number <span class="optional">(optional)</span></label>
                        <input type="tel" id="contact" name="contact" maxlength="20" placeholder="09XXXXXXXXX">
                    </div>
                    <div class="field span-2">
                        <label for="description">Description <span class="optional">(optional)</span></label>
                        <textarea id="description" name="description" maxlength="1000" rows="3"></textarea>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" id="save-btn">${icon('plus')}<span class="btn-text">Create venue</span></button>
                </div>
            </form>
        </section>
    </div>`;

const form = document.getElementById('venue-form');
const saveBtn = document.getElementById('save-btn');

function setFieldError(name, message) {
    const field = form.elements[name].closest('.field');
    field.classList.toggle('has-error', Boolean(message));
    const old = field.querySelector('.error-text');
    if (old) {
        old.remove();
    }
    if (message) {
        field.insertAdjacentHTML('beforeend', '<span class="error-text">' + escapeHtml(message) + '</span>');
    }
}

function clearErrors() {
    form.querySelectorAll('.has-error').forEach((f) => f.classList.remove('has-error'));
    form.querySelectorAll('.error-text').forEach((e) => e.remove());
}

function placePin(lat, lng, move = true) {
    form.lat.value = lat.toFixed(6);
    form.lng.value = lng.toFixed(6);
    if (!pickerMarker) {
        pickerMarker = new maplibregl.Marker({ color: '#166534', draggable: true })
            .setLngLat([lng, lat])
            .addTo(pickerMap);
        pickerMarker.on('dragend', () => {
            const point = pickerMarker.getLngLat();
            form.lat.value = point.lat.toFixed(6);
            form.lng.value = point.lng.toFixed(6);
        });
    } else {
        pickerMarker.setLngLat([lng, lat]);
    }
    if (move) {
        pickerMap.flyTo({ center: [lng, lat], zoom: Math.max(pickerMap.getZoom(), 15) });
    }
}

function clearPin() {
    if (pickerMarker) {
        pickerMarker.remove();
        pickerMarker = null;
    }
}

pickerMap = createMap('picker-map', { center: DEFAULT_CENTER, zoom: 12, geolocate: false });
pickerMap.on('click', (event) => placePin(event.lngLat.lat, event.lngLat.lng, false));

['lat', 'lng'].forEach((name) => {
    form.elements[name].addEventListener('change', () => {
        const lat = parseFloat(form.lat.value);
        const lng = parseFloat(form.lng.value);
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            placePin(lat, lng);
        }
    });
});

document.getElementById('use-location').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const hint = document.getElementById('picker-hint');
    button.disabled = true;
    hint.textContent = 'Getting your location...';
    try {
        const spot = await getUserLocation();
        placePin(spot.lat, spot.lng);
        hint.textContent = 'Pin placed at your location. Drag it to adjust.';
    } catch (error) {
        hint.textContent = error.message;
    }
    button.disabled = false;
});

function resetForm() {
    editingId = null;
    form.reset();
    clearErrors();
    clearPin();
    form.city.value = 'Zamboanga City';
    form.openingTime.value = '06:00';
    form.closingTime.value = '22:00';
    document.getElementById('form-title').textContent = 'Add a venue';
    document.getElementById('cancel-edit').hidden = true;
    saveBtn.innerHTML = icon('plus') + '<span class="btn-text">Create venue</span>';
    pickerMap.jumpTo({ center: DEFAULT_CENTER, zoom: 12 });
    renderList();
}

function startEdit(id) {
    const venue = venues.find((v) => v.id === id);
    if (!venue) {
        return;
    }
    editingId = id;
    clearErrors();
    form.adminId.value = venue.adminId;
    form.status.value = venue.status;
    form.name.value = venue.name;
    form.address.value = venue.address;
    form.city.value = venue.city || '';
    form.openingTime.value = venue.openingTime;
    form.closingTime.value = venue.closingTime;
    form.contact.value = venue.contact || '';
    form.description.value = venue.description || '';
    clearPin();
    if (hasCoords(venue)) {
        placePin(venue.lat, venue.lng);
    }
    document.getElementById('form-title').textContent = 'Edit venue';
    document.getElementById('cancel-edit').hidden = false;
    saveBtn.innerHTML = icon('check') + '<span class="btn-text">Save changes</span>';
    renderList();
    document.getElementById('form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => pickerMap.resize(), 300);
}

document.getElementById('cancel-edit').addEventListener('click', (event) => {
    event.preventDefault();
    resetForm();
});

function renderAdmins() {
    form.adminId.innerHTML = admins.length
        ? admins.map((a) => '<option value="' + a.id + '">' + escapeHtml(a.firstName + ' ' + a.lastName)
            + (a.status !== 'active' ? ' (' + escapeHtml(a.status) + ')' : '') + '</option>').join('')
        : '<option value="">No admins yet</option>';
    document.getElementById('no-admins').innerHTML = admins.length ? '' : `
        <div class="alert alert-error">
            ${icon('alert')}
            <span>Every venue needs an admin. Create an admin account first (register an account, then set its role to <b>admin</b> in Firestore).</span>
        </div>`;
    saveBtn.disabled = !admins.length;
}

function renderList() {
    document.getElementById('venue-total').textContent = venues.length + ' total';
    const box = document.getElementById('venue-list');

    if (!venues.length) {
        box.innerHTML = `<div class="empty"><strong>No venues yet</strong>Create the first venue using the form.</div>`;
        return;
    }

    box.innerHTML = `
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>Venue</th>
                        <th>Admin</th>
                        <th>Courts</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${venues.map((v) => `
                    <tr${v.id === editingId ? ' class="is-selected"' : ''}>
                        <td class="td-main">
                            <strong>${escapeHtml(v.name)}</strong>
                            <span class="cell-sub">${escapeHtml(v.address)}</span>
                        </td>
                        <td data-label="Admin">${escapeHtml(v.adminName || '')}</td>
                        <td data-label="Courts">
                            <span class="cell-stack">
                                <span>${courtCount[v.id] || 0}</span>
                                <span class="cell-sub">${bookingCount[v.id] || 0} bookings</span>
                            </span>
                        </td>
                        <td data-label="Status">${statusBadge(v.status)}</td>
                        <td class="td-actions">
                            <div class="actions">
                                <button type="button" class="btn btn-soft btn-sm" data-edit="${v.id}">${icon('edit')}Edit</button>
                                <button type="button" class="btn btn-soft btn-sm" data-toggle="${v.id}">${v.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                                <button type="button" class="btn btn-soft btn-sm btn-danger-text" data-delete="${v.id}" aria-label="Delete">${icon('trash')}</button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

async function load() {
    const [venueSnap, adminSnap, courtSnap, reservationSnap] = await Promise.all([
        getDocs(collection(db, 'venues')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'admin'))),
        getDocs(collection(db, 'courts')),
        getDocs(collection(db, 'reservations'))
    ]);

    venues = venueSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    admins = adminSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));

    courtCount = {};
    courtSnap.docs.forEach((d) => {
        const venueId = d.data().venueId;
        courtCount[venueId] = (courtCount[venueId] || 0) + 1;
    });

    bookingCount = {};
    reservationSnap.docs.forEach((d) => {
        const venueId = d.data().venueId;
        bookingCount[venueId] = (bookingCount[venueId] || 0) + 1;
    });

    renderAdmins();
    renderList();
}

function validate() {
    const data = {
        adminId: form.adminId.value,
        status: form.status.value === 'inactive' ? 'inactive' : 'active',
        name: form.name.value.trim(),
        address: form.address.value.trim(),
        city: form.city.value.trim(),
        lat: parseFloat(form.lat.value),
        lng: parseFloat(form.lng.value),
        openingTime: form.openingTime.value.slice(0, 5),
        closingTime: form.closingTime.value.slice(0, 5),
        contact: form.contact.value.trim(),
        description: form.description.value.trim()
    };
    const errors = {};

    if (!admins.find((a) => a.id === data.adminId)) {
        errors.adminId = 'Choose an admin to manage this venue.';
    }
    if (!data.name) {
        errors.name = 'Venue name is required.';
    }
    if (!data.address) {
        errors.address = 'Address is required.';
    }
    if (!data.city) {
        errors.city = 'City is required.';
    }
    if (isNaN(data.lat) || isNaN(data.lng) || Math.abs(data.lat) > 90 || Math.abs(data.lng) > 180) {
        errors.lat = 'Pick the venue location on the map.';
    }
    if (!/^\d{2}:\d{2}$/.test(data.openingTime)) {
        errors.openingTime = 'Enter a valid opening time.';
    }
    if (!/^\d{2}:\d{2}$/.test(data.closingTime)) {
        errors.closingTime = 'Enter a valid closing time.';
    } else if (data.closingTime <= data.openingTime) {
        errors.closingTime = 'Closing time must be later than opening time.';
    }
    if (data.contact && !/^[0-9+\-\s()]{7,20}$/.test(data.contact)) {
        errors.contact = 'Enter a valid contact number.';
    }

    return { data, errors };
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const { data, errors } = validate();
    if (Object.keys(errors).length) {
        Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
        return;
    }

    const admin = admins.find((a) => a.id === data.adminId);
    const record = {
        name: data.name,
        address: data.address,
        city: data.city,
        lat: data.lat,
        lng: data.lng,
        openingTime: data.openingTime,
        closingTime: data.closingTime,
        contact: data.contact || null,
        description: data.description || null,
        status: data.status,
        adminId: admin.id,
        adminName: admin.firstName + ' ' + admin.lastName,
        updatedAt: serverTimestamp()
    };

    saveBtn.disabled = true;

    try {
        if (editingId) {
            const old = venues.find((v) => v.id === editingId);
            const batch = writeBatch(db);
            batch.update(doc(db, 'venues', editingId), record);

            if (old.adminId !== admin.id) {
                const [courtSnap, reservationSnap] = await Promise.all([
                    getDocs(query(collection(db, 'courts'), where('venueId', '==', editingId))),
                    getDocs(query(collection(db, 'reservations'), where('venueId', '==', editingId)))
                ]);
                courtSnap.docs.forEach((d) => batch.update(d.ref, { adminId: admin.id, updatedAt: serverTimestamp() }));
                reservationSnap.docs.forEach((d) => batch.update(d.ref, { adminId: admin.id, updatedAt: serverTimestamp() }));
            }

            if (old.name !== record.name) {
                const courtSnap = await getDocs(query(collection(db, 'courts'), where('venueId', '==', editingId)));
                courtSnap.docs.forEach((d) => batch.update(d.ref, { venueName: record.name }));
            }

            await batch.commit();
            await logActivity('UPDATE_VENUE', record.name, me);
            showFlash('success', record.name + ' was updated.');
        } else {
            record.createdAt = serverTimestamp();
            await addDoc(collection(db, 'venues'), record);
            await logActivity('CREATE_VENUE', record.name, me);
            showFlash('success', record.name + ' was created. ' + record.adminName + ' can now add courts.');
        }

        await load();
        resetForm();
    } catch (error) {
        console.error(error);
        showFlash('error', friendlyError(error));
    }

    saveBtn.disabled = !admins.length;
});

page.addEventListener('click', async (event) => {
    const editBtn = event.target.closest('[data-edit]');
    const toggleBtn = event.target.closest('[data-toggle]');
    const deleteBtn = event.target.closest('[data-delete]');

    if (editBtn) {
        startEdit(editBtn.dataset.edit);
        return;
    }

    const button = toggleBtn || deleteBtn;
    if (!button) {
        return;
    }

    const id = button.dataset.toggle || button.dataset.delete;
    const venue = venues.find((v) => v.id === id);
    if (!venue) {
        return;
    }

    try {
        if (toggleBtn) {
            const status = venue.status === 'active' ? 'inactive' : 'active';
            button.disabled = true;
            await updateDoc(doc(db, 'venues', id), { status, updatedAt: serverTimestamp() });
            await logActivity('UPDATE_VENUE_STATUS', venue.name + ' set to ' + status, me);
            showFlash('success', venue.name + (status === 'active' ? ' is now active.' : ' is now hidden from players.'));
        } else {
            if ((bookingCount[id] || 0) > 0) {
                showFlash('error', venue.name + ' has reservations, so it can\'t be deleted. Deactivate it instead.');
                return;
            }
            if (!window.confirm('Delete ' + venue.name + ' and all its courts? This cannot be undone.')) {
                return;
            }
            button.disabled = true;
            const courtSnap = await getDocs(query(collection(db, 'courts'), where('venueId', '==', id)));
            const batch = writeBatch(db);
            courtSnap.docs.forEach((d) => batch.delete(d.ref));
            batch.delete(doc(db, 'venues', id));
            await batch.commit();
            await logActivity('DELETE_VENUE', venue.name, me);
            showFlash('success', venue.name + ' was deleted.');
            if (editingId === id) {
                resetForm();
            }
        }
        await load();
    } catch (error) {
        console.error(error);
        button.disabled = false;
        showFlash('error', friendlyError(error));
    }
});

try {
    await load();
} catch (error) {
    console.error(error);
    showFlash('error', 'Could not load venues. Please refresh the page.');
}