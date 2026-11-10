import { db, requireRole, escapeHtml, logActivity, friendlyError } from './app.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { renderLayout, icon, statusBadge, peso, todayStr, showFlash } from './layout.js';

const profile = await requireRole(['admin']);
const page = renderLayout(profile, 'Courts', 'admin_courts.html');
const me = profile.firstName + ' ' + profile.lastName;

let venues = [];
let courts = [];
let reservations = [];
let editingId = null;

async function load() {
    const [venueSnap, courtSnap, reservationSnap] = await Promise.all([
        getDocs(query(collection(db, 'venues'), where('adminId', '==', profile.id))),
        getDocs(query(collection(db, 'courts'), where('adminId', '==', profile.id))),
        getDocs(query(collection(db, 'reservations'), where('adminId', '==', profile.id)))
    ]);
    venues = venueSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    courts = courtSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.venueName + a.name).localeCompare(b.venueName + b.name, undefined, { numeric: true }));
    reservations = reservationSnap.docs.map((d) => d.data());
}

function upcomingFor(courtId) {
    const today = todayStr();
    return reservations.filter((r) => r.courtId === courtId && ['pending', 'confirmed'].includes(r.status) && r.date >= today).length;
}

function render() {
    if (!venues.length) {
        page.innerHTML = `
            <div class="alert alert-error">
                ${icon('alert')}
                <span>You don't have a venue yet. Ask the super admin to assign one to your account before adding courts.</span>
            </div>`;
        return;
    }

    const editing = courts.find((c) => c.id === editingId) || null;
    const form = editing || { venueId: venues[0].id, name: '', type: 'outdoor', surface: '', hourlyRate: '', status: 'available' };

    const rows = courts.map((c) => {
        const upcoming = upcomingFor(c.id);
        return `
        <tr${c.id === editingId ? ' class="is-selected"' : ''}>
            <td class="td-main">
                <strong>${escapeHtml(c.name)}</strong>
                <span class="cell-sub">${venues.length > 1 ? escapeHtml(c.venueName) + ' &middot; ' : ''}${upcoming} upcoming booking${upcoming === 1 ? '' : 's'}</span>
            </td>
            <td data-label="Type">${c.type === 'indoor' ? 'Indoor' : 'Outdoor'}${c.surface ? ' &middot; ' + escapeHtml(c.surface) : ''}</td>
            <td data-label="Rate">${peso(c.hourlyRate)}/hr</td>
            <td data-label="Status">${statusBadge(c.status)}</td>
            <td class="td-actions">
                <div class="actions">
                    <button type="button" class="btn btn-soft btn-sm" data-edit="${c.id}">${icon('edit')}Edit</button>
                    <button type="button" class="btn btn-soft btn-sm btn-danger-text" data-delete="${c.id}" aria-label="Delete">${icon('trash')}</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    page.innerHTML = `
        <div class="grid-2 grid-form">
            <section class="panel">
                <div class="panel-head">
                    <h3>Your courts</h3>
                    <span class="panel-note">${courts.length} total</span>
                </div>
                ${courts.length ? `
                <div class="table-wrap">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Court</th>
                                <th>Type</th>
                                <th>Rate</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>` : `
                <div class="empty">
                    <strong>No courts yet</strong>
                    Add your first court using the form.
                </div>`}
            </section>

            <section class="panel form-panel">
                <div class="panel-head">
                    <h3>${editing ? 'Edit court' : 'Add a court'}</h3>
                    ${editing ? '<a href="#" class="panel-link" id="cancel-edit">Cancel</a>' : ''}
                </div>
                <form class="panel-body" id="court-form" novalidate>
                    <div class="form-grid">
                        <div class="field span-2"${venues.length > 1 ? '' : ' style="display: none"'}>
                            <label for="venueId">Venue</label>
                            <select id="venueId" name="venueId">
                                ${venues.map((v) => `<option value="${v.id}"${v.id === form.venueId ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field span-2">
                            <label for="name">Court name</label>
                            <input type="text" id="name" name="name" value="${escapeHtml(form.name)}" maxlength="50" placeholder="Court 1" required>
                        </div>
                        <div class="field">
                            <label for="type">Type</label>
                            <select id="type" name="type">
                                <option value="outdoor"${form.type === 'outdoor' ? ' selected' : ''}>Outdoor</option>
                                <option value="indoor"${form.type === 'indoor' ? ' selected' : ''}>Indoor</option>
                            </select>
                        </div>
                        <div class="field">
                            <label for="surface">Surface <span class="optional">(optional)</span></label>
                            <input type="text" id="surface" name="surface" value="${escapeHtml(form.surface || '')}" maxlength="50" placeholder="Acrylic">
                        </div>
                        <div class="field">
                            <label for="hourlyRate">Hourly rate (&#8369;)</label>
                            <input type="number" id="hourlyRate" name="hourlyRate" value="${form.hourlyRate}" min="0" step="0.01" placeholder="250" required>
                        </div>
                        <div class="field">
                            <label for="status">Status</label>
                            <select id="status" name="status">
                                <option value="available"${form.status === 'available' ? ' selected' : ''}>Available</option>
                                <option value="maintenance"${form.status === 'maintenance' ? ' selected' : ''}>Maintenance</option>
                                <option value="inactive"${form.status === 'inactive' ? ' selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                    <p class="hint form-hint">Only courts marked <b>Available</b> can be booked by players.</p>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">${icon(editing ? 'check' : 'plus')}${editing ? 'Save changes' : 'Add court'}</button>
                    </div>
                </form>
            </section>
        </div>`;
}

function setFieldError(form, name, message) {
    const field = form.elements[name].closest('.field');
    field.classList.add('has-error');
    field.insertAdjacentHTML('beforeend', '<span class="error-text">' + escapeHtml(message) + '</span>');
}

page.addEventListener('submit', async (event) => {
    if (event.target.id !== 'court-form') {
        return;
    }
    event.preventDefault();

    const form = event.target;
    form.querySelectorAll('.error-text').forEach((e) => e.remove());
    form.querySelectorAll('.has-error').forEach((f) => f.classList.remove('has-error'));

    const data = {
        venueId: form.venueId.value,
        name: form.name.value.trim(),
        type: form.type.value === 'indoor' ? 'indoor' : 'outdoor',
        surface: form.surface.value.trim(),
        hourlyRate: form.hourlyRate.value.trim(),
        status: form.status.value
    };
    const errors = {};
    const venue = venues.find((v) => v.id === data.venueId);

    if (!venue) {
        errors.venueId = 'Choose one of your venues.';
    }
    if (!data.name) {
        errors.name = 'Court name is required.';
    } else if (courts.some((c) => c.id !== editingId && c.venueId === data.venueId && c.name.toLowerCase() === data.name.toLowerCase())) {
        errors.name = 'A court with this name already exists in this venue.';
    }
    if (data.hourlyRate === '' || isNaN(Number(data.hourlyRate)) || Number(data.hourlyRate) < 0) {
        errors.hourlyRate = 'Enter a valid hourly rate.';
    }
    if (!['available', 'maintenance', 'inactive'].includes(data.status)) {
        errors.status = 'Choose a status.';
    }

    if (Object.keys(errors).length) {
        Object.entries(errors).forEach(([name, message]) => setFieldError(form, name, message));
        return;
    }

    const record = {
        venueId: venue.id,
        venueName: venue.name,
        adminId: profile.id,
        name: data.name,
        type: data.type,
        surface: data.surface || null,
        hourlyRate: Math.round(Number(data.hourlyRate) * 100) / 100,
        status: data.status,
        updatedAt: serverTimestamp()
    };

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        if (editingId) {
            await updateDoc(doc(db, 'courts', editingId), record);
            await logActivity('UPDATE_COURT', record.name, me);
            showFlash('success', record.name + ' was updated.');
        } else {
            record.createdAt = serverTimestamp();
            await addDoc(collection(db, 'courts'), record);
            await logActivity('CREATE_COURT', record.name, me);
            showFlash('success', record.name + ' was added.');
        }
        editingId = null;
        await load();
        render();
    } catch (error) {
        console.error(error);
        button.disabled = false;
        showFlash('error', friendlyError(error));
    }
});

page.addEventListener('click', async (event) => {
    if (event.target.closest('#cancel-edit')) {
        event.preventDefault();
        editingId = null;
        render();
        return;
    }

    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) {
        editingId = editBtn.dataset.edit;
        render();
        document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    const deleteBtn = event.target.closest('[data-delete]');
    if (!deleteBtn) {
        return;
    }

    const court = courts.find((c) => c.id === deleteBtn.dataset.delete);
    if (!court) {
        return;
    }

    if (reservations.some((r) => r.courtId === court.id)) {
        showFlash('error', court.name + ' has reservations, so it can\'t be deleted. Set its status to Inactive instead.');
        return;
    }

    if (!window.confirm('Delete ' + court.name + '? This cannot be undone.')) {
        return;
    }

    deleteBtn.disabled = true;

    try {
        await deleteDoc(doc(db, 'courts', court.id));
        await logActivity('DELETE_COURT', court.name, me);
        if (editingId === court.id) {
            editingId = null;
        }
        await load();
        render();
        showFlash('success', court.name + ' was deleted.');
    } catch (error) {
        console.error(error);
        deleteBtn.disabled = false;
        showFlash('error', friendlyError(error));
    }
});

try {
    await load();
    render();
} catch (error) {
    console.error(error);
    page.innerHTML = '';
    showFlash('error', 'Could not load your courts. Please refresh the page.');
}