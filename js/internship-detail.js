/* ==========================================================
   internship-detail.js — Internship detail page logic
   Harjoittelun yksityiskohtasivun logiikka
   ========================================================== */

let _lastSidebarApps = null;

function rerenderApplicantCards() {
  if (_lastSidebarApps !== null) renderSidebarApplicants(_lastSidebarApps);
}

/**
 * EN: Wraps a long text string in a two-span "Show more / Show less" pattern.
 *     Returns plain text if the string is within the 200-character limit.
 *     The key parameter ensures unique element IDs on pages where multiple
 *     expandable blocks exist (description, responsibilities, requirements).
 * FI: Käärii pitkän tekstimerkkijonon kahden span-elementin "Näytä lisää / Näytä vähemmän" -kuviolle.
 *     Palauttaa pelkkää tekstiä, jos merkkijono on 200 merkin rajan sisällä.
 *     key-parametri varmistaa ainutlaatuiset elementti-ID:t sivuilla, joilla on
 *     useita laajennettavia lohkoja (kuvaus, vastuualueet, vaatimukset).
 * @param {string} text - EN: text to wrap / FI: käärittävä teksti
 * @param {string} key - EN: unique identifier for DOM IDs / FI: ainutlaatuinen tunniste DOM-ID:tä varten
 * @returns {string} EN: HTML string / FI: HTML-merkkijono
 */
function buildExpandable(text, key) {
  const LIMIT = 200;
  if (text.length <= LIMIT) return text;
  return `<span id="exp-short-${key}">${text.slice(0, LIMIT)}… <a href="javascript:void(0)" onclick="toggleExpand('${key}')">Show more</a></span>` +
         `<span id="exp-full-${key}" style="display:none;">${text} <a href="javascript:void(0)" onclick="toggleExpand('${key}')">Show less</a></span>`;
}

/**
 * EN: Toggles between the short and full text spans built by buildExpandable.
 * FI: Vaihtaa buildExpandable-funktion rakentamien lyhyen ja täyden tekstin span-elementtien välillä.
 * @param {string} key - EN: the same key used in buildExpandable / FI: sama avain kuin buildExpandable-funktiossa
 */
function toggleExpand(key) {
  const s = document.getElementById('exp-short-' + key);
  const f = document.getElementById('exp-full-'  + key);
  const expanded = f.style.display !== 'none';
  s.style.display = expanded ? 'inline' : 'none';
  f.style.display = expanded ? 'none'   : 'inline';
}

/**
 * EN: Main data-loading function for the internship detail page.
 *     Fetches the position record and its parent company in two separate queries
 *     (rather than a JOIN) because the company lookup is non-fatal — missing
 *     company data shows a placeholder instead of breaking the whole page.
 *     After populating all display fields, it also:
 *       - Shows/hides the Apply button based on whether the user already applied.
 *       - Controls sidebar visibility (shown only to the company owner).
 *       - Loads the applicant list if the current user is the position's owner.
 * FI: Harjoittelun yksityiskohtasivun pääasiallinen datan latausfunktio.
 *     Hakee positiotietueen ja sen emoyrityksen kahdessa erillisessä kyselyssä
 *     (ei JOIN-kyselyllä), koska yrityksen haku ei ole kohtalokas —
 *     puuttuvat yritystiedot näyttävät paikkamerkin eikä hajota koko sivua.
 *     Kaikkien näyttökenttien täyttämisen jälkeen myös:
 *       - Näyttää/piilottaa Hae-painikkeen sen perusteella, onko käyttäjä jo hakenut.
 *       - Ohjaa sivupalkin näkyvyyttä (näkyy vain yrityksen omistajalle).
 *       - Lataa hakijalistauksen, jos nykyinen käyttäjä on position omistaja.
 * @param {string|number} positionId - EN: position ID from URL / FI: positio-ID URL:sta
 */
async function loadInternshipDetail(positionId) {
    try {
        // EN: Normalise the ID to an integer if it looks numeric — Supabase needs
        //     the correct type to match the bigint primary key column.
        // FI: Normalisoidaan ID kokonaisluvuksi, jos se näyttää numeeriselta —
        //     Supabase tarvitsee oikean tyypin vastatakseen bigint-pääavainkolumnia.
        const normalizedPositionId = /^\d+$/.test(String(positionId))
            ? parseInt(positionId, 10)
            : positionId;

        const { data: position, error: posError } = await supabaseClient
            .from('positions')
            .select('*')
            .eq('position_id', normalizedPositionId)
            .single();
  
        if (posError || !position) throw new Error("Position not found");
  
        const companyResult = await supabaseClient
            .from('Companies')
            .select('*')
            .eq('company_id', position.company_id)
            .single();

        let company = companyResult.data;
        if (companyResult.error || !company) {
            console.warn('Company not found for position:', positionId, companyResult.error);
            company = { company_name: 'Unknown Company' };
        }

        document.querySelector('.card-title').textContent = position.title;
        const companyNameEl = document.querySelector('.card-header .text-muted');
        if (companyNameEl) companyNameEl.textContent = company?.company_name || 'Unknown Company';

        // Load application count and spots info — non-fatal if it fails
        try {
            const [
                { count: appCount, error: appError },
                { count: acceptedCount, error: accError }
            ] = await Promise.all([
                supabaseClient.from('applications').select('*', { count: 'exact', head: true }).eq('position_id', normalizedPositionId),
                supabaseClient.from('applications').select('*', { count: 'exact', head: true }).eq('position_id', normalizedPositionId).eq('status', 'accepted')
            ]);

            if (appError) throw appError;

            const countBadge = document.getElementById('applicationCountBadge');
            if (countBadge) countBadge.textContent = `👥 ${appCount ?? 0} applied`;

            const spotsTotal = position.spots_total || 1;
            const accepted = acceptedCount ?? 0;
            const spotsLeft = spotsTotal - accepted;
            const spotsBadge = document.getElementById('badgeSpots');
            if (spotsBadge) spotsBadge.textContent = `🪑 ${tSpots(spotsLeft, spotsTotal)}`;
        } catch (appCountErr) {
            console.warn('Unable to load application count:', appCountErr);
            const countBadge = document.getElementById('applicationCountBadge');
            if (countBadge) countBadge.textContent = '👥 N/A';
            const spotsBadge = document.getElementById('badgeSpots');
            if (spotsBadge) spotsBadge.textContent = `🪑 ${t('companyProfile.spotsOne').replace('1', String(position.spots_total || 1))}`;
        }

        const bPublished = document.getElementById('badgePublished');
        if (bPublished) {
            bPublished.title = `Published on ${formatDateEuropean(position.created_at)}`;
            bPublished.textContent = `Published: ${formatDateEuropean(position.created_at)}`;
        }

        const bLocation = document.getElementById('badgeLocation');
        if (bLocation) {
            bLocation.textContent = position.location || company?.city || 'Remote';
        }
  
        const bDuration = document.getElementById('badgeDuration');
        if (bDuration) {
            const startDate = position.period_start ? formatDateEuropean(position.period_start) : 'TBD';
            const endDate = position.period_end ? formatDateEuropean(position.period_end) : 'Open';
            bDuration.textContent = `${startDate} - ${endDate}`;
        }

        const bSalary = document.getElementById('badgeSalary');
        if (bSalary) {
            bSalary.textContent = formatSalary(position.salary);
        }

        function formatSalary(salary) {
            if (salary == null || salary === '') return 'Negotiable';
            const numSalary = parseFloat(salary);
            if (isNaN(numSalary)) return salary;
            return `${Math.round(numSalary)}€ / month`;
        }
        
                const durationEl = document.getElementById('displayDuration');
                if (durationEl) {
                    if (position.period_start && position.period_end) {
                        durationEl.textContent = `${formatDateEuropean(position.period_start)} - ${formatDateEuropean(position.period_end)}`;
                    } else {
                        durationEl.textContent = position.duration || 'Not specified';
                    }
                }
        
                const locationEl = document.getElementById('displayLocation');
                if (locationEl) {
                    locationEl.textContent = position.location || company?.city || 'Remote';
                }
        
        // About Us 
        const aboutUs = document.getElementById('pDesc');
        if (aboutUs) aboutUs.textContent = company?.description || 'No description provided.';

        // Company Profile 
        const displayDesc = document.getElementById('dCompanyDesc');
        if (displayDesc) displayDesc.textContent = company?.description || 'No description.';

        const displayEmail = document.getElementById('dCompanyEmail');
        if (displayEmail) {
          displayEmail.innerHTML = '';
          if (company?.contact_email) {
            const a = document.createElement('a');
            a.href = `mailto:${company.contact_email}`;
            a.textContent = company.contact_email;
            displayEmail.appendChild(a);
          } else {
            displayEmail.textContent = 'No contact email provided.';
          }
        }

        const displayWebsite = document.getElementById('dWebsite');
        if (displayWebsite) displayWebsite.textContent = company?.website || 'N/A';

        const displayCity = document.getElementById('dHeadquarters');
        if (displayCity) displayCity.textContent = company?.city || 'N/A';

        const displayY = document.getElementById('dYTunnus');
        if (displayY) displayY.textContent = company?.business_id || 'N/A';
  
        const descSection = document.getElementById('descriptionSection');
        const descEl = document.getElementById('displayDescription');
        if (descEl) {
            const descValue = position.description != null ? String(position.description).trim() : '';
            if (descValue !== '') {
                descEl.innerHTML = buildExpandable(descValue, 'desc');
            } else if (descSection) {
                descSection.style.display = 'none';
            }
        }

        const responsibilitiesEl = document.getElementById('displayResponsibilities');
        if (responsibilitiesEl) {
            const respValue = position.responsibilities != null ? String(position.responsibilities).trim() : '';
            if (respValue !== '') {
                responsibilitiesEl.innerHTML = buildExpandable(respValue, 'resp');
            } else {
                responsibilitiesEl.closest('.card-content').style.display = 'none';
            }
        }

        const reqsElement = document.getElementById('pReqs');
        if (reqsElement) {
            const reqs = position.requirements != null ? String(position.requirements).trim() : '';
            reqsElement.innerHTML = reqs ? buildExpandable(reqs, 'reqs') : '';
        }

        // 5. COMPANY CARD
        if (document.getElementById('dCompanyDesc')) document.getElementById('dCompanyDesc').textContent = company?.description || '';
        if (document.getElementById('dWebsite')) document.getElementById('dWebsite').textContent = company?.website || 'N/A';
        if (document.getElementById('dHeadquarters')) document.getElementById('dHeadquarters').textContent = company?.city || 'N/A';
        if (document.getElementById('dYTunnus')) document.getElementById('dYTunnus').textContent = company?.business_id || 'N/A';

        // --- 4. FAVORITES LOGIC ---
        // --- 4. FAVORITES LOGIC ---
        const favContainer = document.getElementById('favBtnContainer');
        if (favContainer) {
            // Force the ID onto the container so the button can find it
            favContainer.setAttribute('data-job-id', position.position_id);
        }

        // EN: Store position and company on window so other functions on this page
        //     (apply modal, favorites, email notification) can access them without
        //     passing them as arguments through every call chain.
        // FI: Tallennetaan positio ja yritys window-objektiin, jotta muut funktiot
        //     tällä sivulla (hakumodaali, suosikit, sähköposti-ilmoitus) voivat
        //     käyttää niitä ilman, että ne välitetään argumentteina jokaisessa kutsuketjussa.
        window.currentPosition = position;
        window.currentCompany = company;

        // Hide heart for non-students (same logic as listing page)
const userRole = localStorage.getItem('userRole');
const favBtn = document.querySelector('#favBtnContainer .favorite-btn');
if (favBtn) {
  if (userRole !== '1') {
    favBtn.style.display = 'none';
  } else {
    favBtn.style.display = '';
  }
}
        checkAlreadyApplied(position.position_id);

        // Set the heart color immediately if the helper exists
        if (typeof updateFavoriteStates === 'function') {
            updateFavoriteStates();
        }

        // EN: Clone the heart button before re-attaching the listener to remove any
        //     stale listeners added in previous loadInternshipDetail calls.
        //     Without cloning, multiple listeners would stack on the same element.
        // FI: Kloonataan sydänpainike ennen kuuntelijan uudelleenliittämistä
        //     aiempien loadInternshipDetail-kutsujen lisäämien vanhtuneiden kuuntelijoiden poistamiseksi.
        //     Ilman kloonausta useita kuuntelijoita kasautuisi samaan elementtiin.
        // Attach listener specifically to the heart on the detail page
        const detailFavBtn = document.querySelector('#favBtnContainer .favorite-btn');
        if (detailFavBtn) {
            const newBtn = detailFavBtn.cloneNode(true);
            detailFavBtn.parentNode.replaceChild(newBtn, detailFavBtn);
            newBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleFavorite(position.position_id, this);
            });
        }

// Hide Apply buttons for company users
        hideApplyButtonForCompanies();

        // Disable Apply button and show banner if position is no longer active
        if (position.status && position.status !== 'active') {
            const applyBtn = document.getElementById('applyBtn');
            if (applyBtn) {
                applyBtn.textContent = '🔒 Position Closed';
                applyBtn.disabled = true;
                applyBtn.style.background = '#9ca3af';
                applyBtn.style.cursor = 'not-allowed';
                applyBtn.style.opacity = '0.8';
                applyBtn.onclick = null;
            }
            const statusBadge = document.getElementById('badgeStatus');
            if (statusBadge) statusBadge.style.display = '';
            const banner = document.getElementById('closedBanner');
            if (banner) banner.style.display = '';
        }

        // Show the application sidebar only if the current user is the company owner
        let isOwner = false;
        if (position.company_id) {
            try {
                isOwner = await updateSidebarVisibility(position.company_id);
            } catch (visibilityErr) {
                console.warn('Sidebar visibility check failed:', visibilityErr);
            }
        }

        // Try owner-specific loading, but don’t fail the whole page if it cannot complete
        if (position.company_id && isOwner) {
            try {
                await checkOwnerAndLoadApplicants(position.company_id, position.position_id);
            } catch (ownerErr) {
                console.warn('Could not load owner/applicant data:', ownerErr);
            }
        }

    } catch (err) {
        console.error('Error loading detail:', err);
        const message = err?.message || err?.toString() || 'Unknown error';
        showToast("Could not load details: " + message, 'error');
    }
}

  // --- MODAL LOGIC ---

/**
 * EN: Hides the Apply and Save buttons for company accounts so they cannot
 *     accidentally apply to a position they posted or one from another company.
 * FI: Piilottaa Hae- ja Tallenna-painikkeet yritystileiltä, jotta he eivät
 *     vahingossa hae positioon, jonka he itse julkaisivat tai joka on toiselta yritykseltä.
 */
function hideApplyButtonForCompanies() {
  const session = getCurrentSession ? getCurrentSession() : null;
  if (session && session.role === 2) {
    const applyBtn = document.querySelector('.card-footer .btn-primary');
    const saveBtn = document.querySelector('.card-footer .btn-outline');
    if (applyBtn) applyBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
  }
  
  // Hide heart for anyone who isn't a student
  const userRole = localStorage.getItem('userRole');
  const favBtn = document.querySelector('#favBtnContainer .favorite-btn');
  if (favBtn) {
    favBtn.style.display = userRole === '1' ? '' : 'none';
  }
}

/**
 * EN: Opens the application modal pre-filled with the student's profile data
 *     (name, phone, email, existing CV). Requires student authentication.
 *     If no CV exists in the profile, a warning link to profile setup is shown
 *     so the student can add one before submitting.
 * FI: Avaa hakumodaalin täytettyä opiskelijan profiilitiedot etukäteen
 *     (nimi, puhelin, sähköposti, olemassa oleva CV). Vaatii opiskelijan tunnistautumisen.
 *     Jos profiilissa ei ole CV:tä, näytetään varoituslinkki profiiliasetuksiin,
 *     jotta opiskelija voi lisätä sen ennen lähettämistä.
 */
async function openApplyModal() {
  const session = requireAuth();
  if (!session || session.role !== 1) {
    showToast("Student login required to apply.", 'warning');
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from('student_profiles')
    .select('id, first_name, last_name, phone, cv_url')
    .eq('user_id', session.userId)
    .single();

  if (error || !profile) {
    console.error("Profile check error:", error);
    showToast("Student profile not found. Please complete your profile first.", 'warning');
    return;
  }

  window.currentStudentId = profile.id;
  window.existingCvUrl = profile.cv_url || null;

  // Pre-fill read-only fields
  const el = id => document.getElementById(id);
  if (el('applyFirstName')) el('applyFirstName').value = profile.first_name || '';
  if (el('applyLastName'))  el('applyLastName').value  = profile.last_name  || '';
  if (el('applyEmail'))     el('applyEmail').value     = session.login       || '';
  if (el('applyPhone'))     el('applyPhone').value     = profile.phone       || '';

  // Show CV from profile
  const cvInfo = document.getElementById('cvFileInfo');
  if (profile.cv_url) {
    const fileName = decodeURIComponent(profile.cv_url.split('/').pop().split('?')[0]);
    cvInfo.innerHTML = `<p style="font-size:0.9rem; color:#15803d; margin:0;">✅ ${fileName}</p>`;
  } else {
    cvInfo.innerHTML = '<p style="font-size:0.9rem; color:#e57373; margin:0;">⚠ No CV in your profile. <a href="student-profile.html" style="color:#6366f1;">Add it →</a></p>';
  }

  // Populate modal title and company
  const modalTitle   = document.getElementById('modalTitle');
  const modalCompany = document.getElementById('modalCompany');
  if (modalTitle)   modalTitle.textContent   = window.currentPosition?.title        || 'this position';
  if (modalCompany) modalCompany.textContent = window.currentCompany?.company_name  || 'this company';

  document.getElementById('applyModal').style.display = "block";
}

/**
 * EN: Checks whether the current student has already applied to this position
 *     and disables the Apply button if so. Prevents duplicate applications
 *     at the UI level (the database has a unique constraint as well).
 * FI: Tarkistaa, onko nykyinen opiskelija jo hakenut tähän positioon,
 *     ja poistaa Hae-painikkeen käytöstä, jos on. Estää päällekkäiset hakemukset
 *     UI-tasolla (tietokannassa on myös ainutlaatuisuusrajoite).
 * @param {number} positionId - EN: position to check / FI: tarkistettava positio
 */
async function checkAlreadyApplied(positionId) {
  const session = typeof getCurrentSession === 'function' ? getCurrentSession() : null;
  if (!session || session.role !== 1) return;

  const { data: profile } = await supabaseClient
    .from('student_profiles')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();

  if (!profile) return;

  const { data } = await supabaseClient
    .from('applications')
    .select('application_id')
    .eq('student_id', profile.id)
    .eq('position_id', positionId)
    .maybeSingle();

  const btn = document.getElementById('applyBtn');
  if (!btn) return;

  if (data) {
    btn.textContent = '✓ Applied';
    btn.disabled = true;
    btn.style.background = '#6b7280';
    btn.style.cursor = 'default';
    btn.onclick = null;
  }
}

/**
 * EN: Shows the company edit controls (companyFormControls) only if the
 *     logged-in user is the owner of the given company. Falls back to
 *     Supabase Auth session if the custom-session getUserId returns nothing.
 * FI: Näyttää yrityksen muokkaussäätimet (companyFormControls) vain, jos
 *     kirjautunut käyttäjä on annetun yrityksen omistaja. Käyttää Supabase Auth
 *     -istuntoa varavaihtoehtonaan, jos mukautettu istunnon getUserId ei palauta mitään.
 * @param {number} companyId - EN: company to check ownership of / FI: yritys, jonka omistajuus tarkistetaan
 */
async function enableCompanyEditFeatures(companyId) {
    const adminPanel = document.getElementById('companyFormControls');
    if (!adminPanel) return;
    adminPanel.style.display = "none";

    let userId = null;
    if (typeof getCurrentSession === 'function') {
        const session = getCurrentSession();
        if (session && session.role === 2) {
            userId = session.userId;
        }
    }

    if (!userId) {
        const { data: authData } = await supabaseClient.auth.getUser();
        userId = authData?.user?.id || null;
    }

    if (!userId) return;

    const { data: company, error } = await supabaseClient
        .from('Companies')
        .select('user_id')
        .eq('company_id', companyId)
        .single();

    if (!error && company && company.user_id === userId) {
        adminPanel.style.display = "block";
    }
}
function closeApplyModal() {
    document.getElementById('applyModal').style.display = "none";
    document.body.style.overflow = "auto";
}

/**
 * EN: Shows or hides the #companyFormControls element depending on whether
 *     the logged-in user is the company owner. Very similar to
 *     enableCompanyEditFeatures but is called from a different entry point.
 * FI: Näyttää tai piilottaa #companyFormControls-elementin sen mukaan, onko
 *     kirjautunut käyttäjä yrityksen omistaja. Hyvin samankaltainen kuin
 *     enableCompanyEditFeatures, mutta kutsutaan eri sisäänkäyntipisteestä.
 * @param {number} companyId - EN: company ID to check / FI: tarkistettava yritys-ID
 */
async function checkOwnershipAndShowControls(companyId) {
    const controls = document.getElementById('companyFormControls');
    if (!controls) return;

    let userId = null;
    if (typeof getCurrentSession === 'function') {
        const session = getCurrentSession();
        if (session && session.role === 2) {
            userId = session.userId;
        }
    }

    if (!userId) {
        const { data: authData } = await supabaseClient.auth.getUser();
        userId = authData?.user?.id || null;
    }

    if (!userId) {
        controls.style.display = "none";
        return;
    }

    const { data: company, error } = await supabaseClient
        .from('Companies')
        .select('user_id')
        .eq('company_id', companyId)
        .single();

    if (!error && company && company.user_id === userId) {
        controls.style.display = "block"; // User is the owner!
    } else {
        controls.style.display = "none";
    }
}

// --- THE EDIT MODULE ---


/**
 * Adds a new input field to the application form.
 */
function addNewLine(label = "") {
    const container = document.getElementById('customLinesContainer');
    const id = Date.now();
    const html = `
        <div class="custom-line" id="line-${id}" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
            <input type="text" placeholder="Question Name (e.g. Github Link)" class="dynamic-label" value="${label}" 
                   style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <button type="button" onclick="document.getElementById('line-${id}').remove()" 
                    style="background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 1.2rem;">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}


// Close modal if user clicks outside of it
window.onclick = function(event) {
    const modal = document.getElementById('applyModal');
    if (event.target == modal) {
        closeApplyModal();
    }
}

// Function to handle the CV file selection UI
function handleCVSelection(input) {
    const fileInfo = document.getElementById('cvFileInfo');
    const statusText = document.getElementById('cvStatusText');
    
    if (input.files && input.files[0]) {
        const fileName = input.files[0].name;
        const fileSize = (input.files[0].size / 1024 / 1024).toFixed(2); // Convert to MB
        
        fileInfo.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; background: #e7f3ff; padding: 8px; border-radius: 4px; margin-bottom:10px;">
                <span style="font-size: 1.2rem;">pdf</span>
                <div style="flex:1; overflow:hidden;">
                    <p style="margin:0; font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${fileName}</p>
                    <p style="margin:0; font-size:0.75rem; color: #666;">${fileSize} MB</p>
                </div>
                <button type="button" onclick="resetCVUpload()" style="border:none; background:none; color:red; cursor:pointer; font-weight:bold;">✕</button>
            </div>
        `;
    }
}

function handleEditCVSelection(input) {
    const statusText = document.getElementById('editCvStatusText');
    if (input.files && input.files[0]) {
        statusText.innerHTML = `<strong>New file selected:</strong> ${input.files[0].name}`;
        statusText.style.color = "#059669"; // Green color
    }
}
// Function to clear the CV selection
function resetCVUpload() {
    const input = document.getElementById('cvUpload');
    input.value = ''; // Clear file
    document.getElementById('cvFileInfo').innerHTML = '<p id="cvStatusText" style="font-size: 0.9rem; color: #666;">No CV uploaded yet.</p>';
}


(function() { if (typeof emailjs !== 'undefined') emailjs.init("JI1iX7kMcKuHQBrGW"); })();

/**
 * EN: Handles the application form submit inside the modal.
 *     Steps:
 *       1. If a new CV file is selected, upload it to the 'resumes' storage bucket.
 *       2. Fall back to the CV already stored in the student's profile if none uploaded.
 *       3. Insert the application row into 'applications' table.
 *       4. Send an email notification to the company via EmailJS (non-blocking).
 *       5. Disable the Apply button and auto-remove the internship from favorites.
 * FI: Käsittelee sovelluksen hakemuksen lähetyksen modaalin sisällä.
 *     Vaiheet:
 *       1. Jos uusi CV-tiedosto on valittu, ladataan se 'resumes'-tallennusämpäriin.
 *       2. Käytetään opiskelijan profiilissa olevaa CV:tä, jos mitään ei ole ladattu.
 *       3. Lisätään hakemuksen rivi 'applications'-taulukkoon.
 *       4. Lähetetään sähköposti-ilmoitus yritykselle EmailJS:n kautta (ei-estävä).
 *       5. Poistetaan Hae-painike käytöstä ja poistetaan harjoittelu automaattisesti suosikeista.
 */
document.getElementById('modalApplyForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // 1. Get the current user
    // Custom auth already checked by requireAuth()


    const submitBtn = e.target.querySelector('button[type="submit"]');
    const cvFile = document.getElementById('cvUpload')?.files[0];

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";

        let cvUrl      = window.existingCvUrl || null;
        let cvOrigName = cvUrl ? decodeURIComponent(cvUrl.split('/').pop().split('?')[0]) : null;

        if (cvFile) {
            submitBtn.innerText = "Uploading CV...";
            const fileName = `${Date.now()}-${cvFile.name}`;
            const { error: uploadError } = await supabaseClient.storage
                .from('resumes').upload(fileName, cvFile);
            if (uploadError) throw uploadError;
            const { data: urlData } = supabaseClient.storage.from('resumes').getPublicUrl(fileName);
            cvUrl      = urlData.publicUrl;
            cvOrigName = cvFile.name;
        }

        if (!cvUrl) {
            showToast("Please add a CV to your profile or upload one here.", 'warning');
            return;
        }

        const { error: dbError } = await supabaseClient
            .from('applications')
            .insert([{
                student_id:       window.currentStudentId,
                position_id:      window.currentPosition.position_id,
                cover_letter:     document.getElementById('applyLetter').value,
                cv_url:           cvUrl,
                cv_original_name: cvOrigName
            }]);

        if (dbError) throw dbError;

        // Notify employer by email
        const companyEmail = window.currentCompany?.contact_email;
        console.log('[Email] company contact_email:', companyEmail);
        console.log('[Email] emailjs loaded:', typeof emailjs !== 'undefined');
        if (companyEmail && typeof emailjs !== 'undefined') {
            const studentName = [
                document.getElementById('applyFirstName')?.value,
                document.getElementById('applyLastName')?.value
            ].filter(Boolean).join(' ') || 'A student';
            const emailParams = {
                to_email:       companyEmail,
                student_name:   studentName,
                position_title: window.currentPosition?.title || 'your position',
                cover_letter:   document.getElementById('applyLetter')?.value?.trim() || 'Not provided',
                profile_link:   window.location.href
            };
            console.log('[Email] sending with params:', emailParams);
            emailjs.send('service_gix61gn', 'template_new_application', emailParams)
                .then(() => console.log('[Email] sent successfully'))
                .catch(err => console.error('[Email] send failed:', err));
        } else if (!companyEmail) {
            console.warn('[Email] skipped — company has no contact_email in database');
        }

        showToast("Application sent!", 'success');
        closeApplyModal();

        const btn = document.getElementById('applyBtn');
        if (btn) {
            btn.textContent = '✓ Applied';
            btn.disabled = true;
            btn.style.background = '#6b7280';
            btn.style.cursor = 'default';
            btn.onclick = null;
        }

        if (typeof removeFavoriteByInternshipId === 'function') {
          await removeFavoriteByInternshipId(window.currentPosition.position_id?.toString());
        }

    } catch (err) {
        console.error(err);
        showToast("Error: " + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Application";
    }
});

/**
 * EN: Verifies company ownership and, if confirmed, shows the applicants section
 *     and renders the full list of applications for this position. This function
 *     is the entry point for the owner-only sidebar on the detail page.
 * FI: Tarkistaa yrityksen omistajuuden ja, jos vahvistettu, näyttää hakijat-osion
 *     ja renderöi täydellisen listauksen tämän position hakemuksista. Tämä funktio
 *     on omistajalle tarkoitetun sivupalkin sisäänkäyntipiste yksityiskohtasivulla.
 * @param {number} companyId - EN: company to verify ownership of / FI: yritys, jonka omistajuus vahvistetaan
 * @param {number} positionId - EN: position to load applications for / FI: positio, jonka hakemukset ladataan
 */
async function checkOwnerAndLoadApplicants(companyId, positionId) {
  try {
      let userId = null;
      if (typeof getCurrentSession === 'function') {
          const session = getCurrentSession();
          if (session && session.role === 2) {
              userId = session.userId;
          }
      }

      if (!userId) {
          const { data: authData } = await supabaseClient.auth.getUser();
          userId = authData?.user?.id || null;
      }

      if (!userId) return;

      const { data: company, error } = await supabaseClient
          .from('Companies')
          .select('user_id')
          .eq('company_id', companyId)
          .single();

      if (error || !company) {
          console.warn('Company lookup failed in owner check:', error);
          return;
      }

      if (company.user_id !== userId) return;

      const section = document.getElementById('applicantsSection');
      if (section) section.style.display = 'block';

      const { data: apps, error: appsError } = await supabaseClient
          .from('applications')
          .select(`
            application_id, status, applied_at, cover_letter, interview_date,
            student_profiles(id, first_name, last_name,
              Users(user_login)
            )
          `)
          .eq('position_id', positionId)
          .order('applied_at', { ascending: false });

      if (appsError) {
          console.error('Error loading applications for owner:', appsError);
          return;
      }

      renderSidebarApplicants(apps || []);
  } catch (err) {
      console.error("Error in owner check:", err);
  }
}

/**
 * EN: Determines whether the owner sidebar should be shown and hides it by
 *     default first. Only returns true (sidebar shown) if:
 *       - A session exists, is role 2, AND
 *       - The session user ID matches the company's user_id in Supabase.
 *     Called before checkOwnerAndLoadApplicants so the sidebar is never
 *     briefly visible to non-owners while the DB query is in flight.
 * FI: Määrittää, pitäisikö omistajan sivupalkki näyttää, ja piilottaa sen
 *     oletusarvoisesti ensin. Palauttaa true (sivupalkki näytetään) vain jos:
 *       - Istunto on olemassa, on rooli 2, JA
 *       - Istunnon käyttäjä-ID vastaa yrityksen user_id:tä Supabasessa.
 *     Kutsutaan ennen checkOwnerAndLoadApplicants-funktiota, jotta sivupalkki
 *     ei ole hetkellisesti näkyvissä ei-omistajille DB-kyselyn ollessa käynnissä.
 * @param {number} companyId - EN: company whose ownership to verify / FI: yritys, jonka omistajuus tarkistetaan
 * @returns {Promise<boolean>}
 */
async function updateSidebarVisibility(companyId) {
  const sidebar = document.querySelector('.sidebar');
  const section = document.getElementById('applicantsSection');

  if (sidebar) sidebar.style.display = 'none';
  if (section) section.style.display = 'none';

  let session = null;
  if (typeof getCurrentSession === 'function') {
      session = getCurrentSession();
  }

  if (!session) {
      return false;
  }

  if (session.role !== 2) {
      return false;
  }

  const userId = session.userId;
  if (!userId) {
      return false;
  }

  const { data: company, error } = await supabaseClient
      .from('Companies')
      .select('user_id')
      .eq('company_id', companyId)
      .single();

  if (error || !company || company.user_id !== userId) {
      return false;
  }

  if (sidebar) sidebar.style.display = '';
  return true;
}

function formatDateEuropean(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * EN: Renders the list of applicants in the owner sidebar. Each card shows the
 *     student's name, email, applied date, current status badge, and scheduled
 *     interview date if one exists. Provides "View" and "Schedule Interview" buttons.
 * FI: Renderöi hakijoiden listan omistajan sivupalkissa. Jokainen kortti näyttää
 *     opiskelijan nimen, sähköpostin, haettuspäivämäärän, nykyisen tila-merkin ja
 *     aikataulutetun haastattelupäivän, jos sellainen on. Tarjoaa "Näytä" ja
 *     "Aikatauluta haastattelu" -painikkeet.
 * @param {object[]} apps - EN: array of application records / FI: hakemusrekisterien taulukko
 */
function renderSidebarApplicants(apps) {
  _lastSidebarApps = apps;
  const container = document.getElementById('companyApplicationsContainer');
  const countEl = document.getElementById('applicantsCount');
  
  if (!container) return;
  if (countEl) countEl.textContent = `(${apps.length})`;

  if (apps.length === 0) {
      container.innerHTML = '<p style="color: #666; font-size: 0.9rem;">No applications yet.</p>';
      return;
  }

  container.innerHTML = apps.map(app => {
    const profile      = app.student_profiles || {};
    const fullName     = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';
    const email        = profile.Users?.user_login || '';
    const status       = app.status || 'pending';
    const statusLabel  = { pending: 'pending', viewed: 'in review', 'in review': 'in review', interview_scheduled: 'interview scheduled', accepted: 'accepted', rejected: 'rejected' }[status] || status;
    const appliedDate  = formatDateEuropean(app.applied_at);
    const existingDate = app.interview_date || '';
    const interviewDate = app.interview_date
      ? `<p style="margin:0.4rem 0 0; font-size:0.85rem; color:#059669;">📅 Interview: ${formatDateEuropean(app.interview_date)} ${new Date(app.interview_date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})}</p>`
      : '';
    const interviewBtn = app.interview_date
      ? `<button class="btn btn-small" style="font-size:0.78rem; background:#d1fae5; color:#065f46;" onclick="scheduleInterview('${fullName}', '${email}', ${app.application_id}, '${existingDate}')">${t('pages.internshipDetail.scheduledBtn')}</button>`
      : `<button class="btn btn-small btn-primary" style="font-size:0.78rem;" onclick="scheduleInterview('${fullName}', '${email}', ${app.application_id}, '')">${t('pages.internshipDetail.scheduleInterviewBtn')}</button>`;
    return `
      <div class="application-card" style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; padding:1rem 0; border-bottom:1px solid #eee;">
        <div style="min-width:0; flex:1;">
          <h5 style="margin:0 0 0.25rem; font-size:1rem;">${window.currentPosition?.title || ''}</h5>
          <p style="margin:0; color:#374151; font-weight:600;">${fullName}</p>
          <p style="margin:0.25rem 0 0; font-size:0.9rem; color:#6b7280;">${email}</p>
          <p style="margin:0.5rem 0 0; font-size:0.85rem; color:#6b7280;">${t('pages.internshipDetail.appliedLabel')} ${appliedDate}</p>
          <p style="margin:0.4rem 0 0; font-size:0.85rem;">${t('pages.internshipDetail.statusLabel')} <span class="status-badge status-${status}">${statusLabel}</span></p>
          ${interviewDate}
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; flex-shrink:0;">
          <button class="btn btn-view" onclick="viewStudentProfile(${profile.id})">${t('pages.internshipDetail.viewBtn')}</button>
          ${interviewBtn}
        </div>
      </div>
    `;
  }).join('');
}

function getStatusDisplay(status) {
  let bgColor = '#fef3c7';
  let textColor = '#92400e';
  let statusText = 'pending';

  if (status === 'viewed' || status === 'in review') {
    bgColor = '#dbeafe';
    textColor = '#1e40af';
    statusText = 'in review';
  } else if (status === 'interview_scheduled') {
    bgColor = '#d1fae5';
    textColor = '#065f46';
    statusText = 'interview scheduled';
  } else if (status === 'accepted' || status === 'ready') {
    bgColor = '#dcfce7';
    textColor = '#166534';
    statusText = 'accepted';
  } else if (status === 'rejected') {
    bgColor = '#fee2e2';
    textColor = '#991b1b';
    statusText = 'rejected';
  }

  return `<span style="display: inline-block; background: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${statusText}</span>`;
}

function showFullApplication(app) {
  console.log('Full application details:', app);
}

// View student profile
/**
 * EN: Opens a read-only modal showing the student's profile details.
 *     Creates the modal element dynamically on first call and reuses it
 *     on subsequent calls, just replacing the body content.
 * FI: Avaa vain luku -modaalin, joka näyttää opiskelijan profiilitiedot.
 *     Luo modaalielementin dynaamisesti ensimmäisellä kutsulla ja käyttää
 *     sitä uudelleen seuraavilla kutsuilla, korvaten vain runkosisällön.
 * @param {number} studentId - EN: student profile ID / FI: opiskelijan profiili-ID
 */
async function viewStudentProfile(studentId) {
  try {
    const { data: student, error } = await supabaseClient
      .from('student_profiles')
      .select('*')
      .eq('id', studentId)
      .single();

    if (error || !student) {
      showToast('Student profile not found.', 'warning');
      return;
    }

    // Display student profile in a modal or redirect
    const profileHTML = `
      <div style="max-height: 500px; overflow-y: auto; padding: 20px;">
        <h3>${student.first_name} ${student.last_name}</h3>
        <p><strong>Email:</strong> ${student.user_id || 'N/A'}</p>
        <p><strong>Phone:</strong> ${student.phone || 'N/A'}</p>
        <p><strong>City:</strong> ${student.city || 'N/A'}</p>
        <p><strong>Education:</strong> ${student.type_education || 'N/A'}</p>
        <p><strong>About:</strong></p>
        <p>${student.about || 'No information provided.'}</p>
        ${student.cv_url ? `<p><a href="${student.cv_url}" target="_blank" class="btn btn-primary btn-small">Download CV</a></p>` : ''}
      </div>
    `;
    let modal = document.getElementById('studentProfileModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'studentProfileModal';
      modal.style.cssText = 'display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.7); overflow-y:auto;';
      modal.innerHTML = '<div style="background:#fff; margin:5% auto; padding:30px; border-radius:12px; width:90%; max-width:550px; position:relative; box-shadow:0 10px 25px rgba(0,0,0,0.2);"><span onclick="document.getElementById(\'studentProfileModal\').style.display=\'none\'" style="position:absolute; right:20px; top:15px; font-size:28px; cursor:pointer; color:#999;">&times;</span><div id="studentProfileModalBody"></div></div>';
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    document.getElementById('studentProfileModalBody').innerHTML = profileHTML;
    modal.style.display = 'block';
  } catch (err) {
    console.error('Error viewing student profile:', err);
    showToast('Error loading student profile: ' + err.message, 'error');
  }
}

/**
 * EN: Marks an application as 'viewed' (i.e. the company has opened it).
 *     Refreshes the sidebar list after the update so the status badge
 *     reflects the change immediately.
 * FI: Merkitsee hakemuksen 'viewed'-tilaan (eli yritys on avannut sen).
 *     Päivittää sivupalkin listan päivityksen jälkeen, jotta tila-merkki
 *     heijastaa muutosta välittömästi.
 * @param {number} applicationId - EN: application to update / FI: päivitettävä hakemus
 * @param {string} studentName - EN: used in the success toast / FI: käytetään onnistumisponnahduksessa
 */
// Review application - update status to 'viewed'
async function reviewApplication(applicationId, studentName) {
  try {
    const { error } = await supabaseClient
      .from('applications')
      .update({ status: 'viewed' })
      .eq('application_id', applicationId);

    if (error) throw error;

    showToast(`Application from ${studentName} marked as "in review".`, 'success');
    
    // Reload applications
    if (window.currentPosition && window.currentPosition.company_id) {
      await checkOwnerAndLoadApplicants(window.currentPosition.company_id, window.currentPosition.position_id);
    }
  } catch (err) {
    console.error('Error reviewing application:', err);
    showToast('Error updating application: ' + err.message, 'error');
  }
}

/**
 * EN: Opens the "Schedule Interview" modal, pre-filling it with any existing
 *     interview date or defaulting to the next business day at 10:00.
 *     Stores the context on modal._data so confirmInterviewScheduleDetail()
 *     can access it without needing hidden inputs.
 * FI: Avaa "Aikatauluta haastattelu" -modaalin, täyttäen sen etukäteen
 *     mahdollisella olemassa olevalla haastattelupäivällä tai oletuksena
 *     seuraavalle arkipäivälle klo 10:00.
 *     Tallentaa kontekstin modal._data-ominaisuuteen, jotta confirmInterviewScheduleDetail()
 *     voi käyttää sitä ilman piilotettuja syötteitä.
 * @param {string} fullName - EN: applicant's full name / FI: hakijan koko nimi
 * @param {string} email - EN: applicant's email for calendar invite / FI: hakijan sähköposti kalenterikutsua varten
 * @param {number} applicationId - EN: application ID to update / FI: päivitettävä hakemus-ID
 * @param {string} existingDate - EN: ISO date string if interview already scheduled / FI: ISO-päivämäärämerkkijono, jos haastattelu on jo aikataulutettu
 */
function scheduleInterview(fullName, email, applicationId, existingDate) {
  const positionTitle = window.currentPosition?.title || 'internship position';
  let modal = document.getElementById('interviewDateModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'interviewDateModal';
    modal.style.cssText = 'position:fixed;z-index:9999;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:white;padding:2rem;border-radius:12px;width:90%;max-width:400px;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <h3 id="interviewModalTitle" style="margin-top:0;">${t('pages.internshipDetail.scheduleInterviewTitle')}</h3>
        <p id="interviewModalDesc" style="color:#6b7280;margin-bottom:1rem;"></p>
        <div class="form-group">
          <label>${t('pages.internshipDetail.dateTimeLabel')}</label>
          <input type="datetime-local" id="interviewDateInput" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;">
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="confirmInterviewScheduleDetail()">${t('pages.internshipDetail.confirmCalendarBtn')}</button>
          <button id="cancelInterviewBtnDetail" class="btn btn-outline" style="color:#dc2626;border-color:#dc2626;display:none;" onclick="cancelInterviewDetail()">${t('pages.internshipDetail.cancelInterviewBtn')}</button>
          <button class="btn btn-outline" onclick="document.getElementById('interviewDateModal').style.display='none'">${t('pages.internshipDetail.closeBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal._data = { fullName, email, positionTitle, applicationId };
  document.getElementById('interviewModalDesc').textContent = `${fullName} — ${positionTitle}`;
  document.getElementById('interviewModalTitle').textContent = existingDate ? t('pages.internshipDetail.rescheduleInterviewTitle') : t('pages.internshipDetail.scheduleInterviewTitle');
  document.getElementById('cancelInterviewBtnDetail').style.display = existingDate ? 'inline-block' : 'none';

  const input = document.getElementById('interviewDateInput');
  if (existingDate) {
    input.value = toLocalInputValue(new Date(existingDate));
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    input.value = toLocalInputValue(tomorrow);
  }

  modal.style.display = 'flex';
}

/**
 * EN: Converts a Date object to the "YYYY-MM-DDTHH:MM" string format required
 *     by datetime-local inputs. Uses local time (not UTC) so the displayed
 *     time matches what the company user sees on their device.
 * FI: Muuntaa Date-objektin "YYYY-MM-DDTHH:MM"-merkkijonomuotoon, jota
 *     datetime-local-syötteet vaativat. Käyttää paikallista aikaa (ei UTC:tä),
 *     jotta näytetty aika vastaa yrityksen käyttäjän laitteella näkemää aikaa.
 * @param {Date} date
 * @returns {string}
 */
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * EN: Cancels an already-scheduled interview by setting interview_date to null
 *     and reverting the application status back to 'pending'.
 * FI: Peruuttaa jo aikataulutetun haastattelun asettamalla interview_date:n
 *     nulliksi ja palauttamalla hakemuksen tilan takaisin 'pending'-tilaan.
 */
async function cancelInterviewDetail() {
  const modal = document.getElementById('interviewDateModal');
  const { applicationId } = modal._data;
  modal.style.display = 'none';
  try {
    const { error } = await supabaseClient
      .from('applications')
      .update({ interview_date: null, status: 'pending' })
      .eq('application_id', applicationId);
    if (error) throw error;
    showToast('Interview cancelled.', 'info');
    if (window.currentPosition) {
      await checkOwnerAndLoadApplicants(window.currentPosition.company_id, window.currentPosition.position_id);
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/**
 * EN: Confirms an interview schedule: saves the date to Supabase, updates
 *     the application status to 'interview_scheduled', then opens Google
 *     Calendar in a new tab with the event pre-filled (title, attendee, times).
 *     The Google Calendar link uses UTC timestamps in the compact YYYYMMDDTHHMMSSz format.
 * FI: Vahvistaa haastattelun aikataulun: tallentaa päivämäärän Supabaseen, päivittää
 *     hakemuksen tilan 'interview_scheduled'-tilaan, sitten avaa Google Kalenterin
 *     uudessa välilehdessä tapahtuma esitäytettynä (otsikko, osallistuja, ajat).
 *     Google Kalenteri -linkki käyttää UTC-aikaleimoja kompaktissa YYYYMMDDTHHMMSSz-muodossa.
 */
async function confirmInterviewScheduleDetail() {
  const modal = document.getElementById('interviewDateModal');
  const { fullName, email, positionTitle, applicationId } = modal._data;
  const dateValue = document.getElementById('interviewDateInput').value;

  if (!dateValue) { showToast('Please select a date and time.', 'error'); return; }

  modal.style.display = 'none';

  const date    = new Date(dateValue);
  const endDate = new Date(date.getTime() + 60 * 60 * 1000);

  try {
    const { error } = await supabaseClient
      .from('applications')
      .update({ interview_date: date.toISOString(), status: 'interview_scheduled' })
      .eq('application_id', applicationId);
    if (error) throw error;
    showToast('Interview scheduled!', 'success');
    if (window.currentPosition) {
      await checkOwnerAndLoadApplicants(window.currentPosition.company_id, window.currentPosition.position_id);
    }
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  }
  const fmt     = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const title   = encodeURIComponent(`Internship Interview - ${fullName}`);
  const details = encodeURIComponent(`Interview with ${fullName} for ${positionTitle}`);
  const guest   = encodeURIComponent(email);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(date)}/${fmt(endDate)}&add=${guest}`;
  window.open(url, '_blank');
}

/**
 * EN: Permanently deletes an application from the database after a confirm dialog.
 *     Used by company owners to remove spam or mistaken applications from their list.
 * FI: Poistaa hakemuksen pysyvästi tietokannasta vahvistusikkunan jälkeen.
 *     Yrityksen omistajat käyttävät tätä poistaakseen roskapostin tai virheelliset
 *     hakemukset listaltaan.
 * @param {number} applicationId - EN: application to delete / FI: poistettava hakemus
 * @param {string} studentName - EN: used in confirm dialog and success toast / FI: käytetään vahvistusikkunassa ja onnistumisponnahduksessa
 */
// Delete application from sidebar
async function deleteApplicationFromSidebar(applicationId, studentName) {
  if (!await showConfirm(`Delete application from ${studentName}?`, 'Delete')) return;

  try {
    const { error } = await supabaseClient
      .from('applications')
      .delete()
      .eq('application_id', applicationId);

    if (error) throw error;

    showToast(`Application from ${studentName} deleted.`, 'success');
    
    // Reload applications
    if (window.currentPosition && window.currentPosition.company_id) {
      await checkOwnerAndLoadApplicants(window.currentPosition.company_id, window.currentPosition.position_id);
    }
  } catch (err) {
    console.error('Error deleting application:', err);
    showToast('Error deleting application: ' + err.message, 'error');
  }
}

/**
 * EN: Opens the Company Profile modal for students only. Fetches company data
 *     and team members from Supabase and displays them in the modal.
 *     Only accessible to logged-in students (role 1).
 * FI: Avaa yrityksen profiilimodaalin vain opiskelijoille. Hakee yrityksen tiedot
 *     ja tiimijäsenet Supabasesta ja näyttää ne modaalissa.
 *     Vain kirjautuneille opiskelijoille (rooli 1).
 */
async function openCompanyProfileModal() {
  const userRole = localStorage.getItem('userRole');
  if (userRole !== '1') {
    showToast('Only students can view company profiles.', 'warning');
    return;
  }

  const modal   = document.getElementById('companyProfileModal');
  const loading = document.getElementById('cpmLoading');
  const content = document.getElementById('cpmContent');
  const errorEl = document.getElementById('cpmError');
  const closeBtn = document.getElementById('companyProfileModalCloseBtn');
  if (!modal) return;

  // Reset to loading state
  modal.style.display = 'block';
  loading.style.display = 'block';
  content.style.display = 'none';
  errorEl.style.display  = 'none';
  if (closeBtn) closeBtn.style.display = 'none';

  try {
    const company = window.currentCompany;
    if (!company || !company.company_id) throw new Error('Company data not available');

    // Fetch fresh company data + team in parallel
    const [companyRes, teamRes] = await Promise.all([
      supabaseClient.from('Companies').select('*').eq('company_id', company.company_id).single(),
      supabaseClient.from('company_team').select('*').eq('company_id', company.company_id).order('created_at')
    ]);

    if (companyRes.error || !companyRes.data) throw new Error('Could not load company data');

    const c    = companyRes.data;
    const team = teamRes.data || [];

    // --- Logo ---
    const logoEl = document.getElementById('cpmLogo');
    if (c.logo_url) {
      logoEl.innerHTML = `<img src="${c.logo_url}" alt="${c.company_name || ''}" style="width:100%;height:100%;object-fit:contain;">`;
    } else {
      logoEl.textContent = '🏢';
    }

    // --- Name / city / website header ---
    document.getElementById('cpmName').textContent = c.company_name || '';
    document.getElementById('cpmCity').textContent = c.city ? `📍 ${c.city}` : '';
    const websiteHeaderEl = document.getElementById('cpmWebsiteHeader');
    if (c.website) {
      websiteHeaderEl.innerHTML = `🌐 <a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" rel="noopener" style="color:var(--primary-color);">${c.website}</a>`;
    } else {
      websiteHeaderEl.textContent = '';
    }

    // --- About ---
    const aboutWrap = document.getElementById('cpmAboutWrap');
    const aboutEl   = document.getElementById('cpmAbout');
    if (c.description) {
      aboutEl.textContent = c.description;
      aboutWrap.style.display = '';
    } else {
      aboutWrap.style.display = 'none';
    }

    // --- Email ---
    const emailEl = document.getElementById('cpmEmail');
    if (c.contact_email) {
      emailEl.innerHTML = `<a href="mailto:${c.contact_email}" style="color:var(--primary-color);">${c.contact_email}</a>`;
    } else {
      emailEl.textContent = '—';
    }

    // --- Website ---
    const websiteEl = document.getElementById('cpmWebsite');
    if (c.website) {
      websiteEl.innerHTML = `<a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" rel="noopener" style="color:var(--primary-color);">${c.website}</a>`;
    } else {
      websiteEl.textContent = '—';
    }

    // --- HQ ---
    document.getElementById('cpmHq').textContent = c.city || '—';

    // --- Y-Tunnus ---
    document.getElementById('cpmYt').textContent = c.business_id || '—';

    // --- Team ---
    const teamWrap = document.getElementById('cpmTeamWrap');
    const teamEl   = document.getElementById('cpmTeam');
    if (team.length > 0) {
      teamEl.innerHTML = team.map(m => `
        <div class="cpm-team-member">
          <div class="cpm-team-avatar">${(m.name || '?').charAt(0).toUpperCase()}</div>
          <div>
            <p style="margin:0; font-weight:600; color:#1f2937;">${m.name || ''}</p>
            <p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">${m.job_title || ''}</p>
            ${m.email ? `<p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">📧 ${m.email}</p>` : ''}
            ${m.phone ? `<p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">📞 ${m.phone}</p>` : ''}
          </div>
        </div>
      `).join('');
      teamWrap.style.display = '';
    } else {
      teamWrap.style.display = 'none';
    }

    // Show content
    loading.style.display = 'none';
    content.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'block';

  } catch (err) {
    console.error('openCompanyProfileModal error:', err);
    loading.style.display = 'none';
    errorEl.style.display  = 'block';
    if (closeBtn) closeBtn.style.display = 'block';
  }
}

/**
 * EN: Shows or hides the "View Company Profile" button based on the current
 *     user's role. Only students (role 1) see the button.
 * FI: Näyttää tai piilottaa "Näytä yrityksen profiili" -painikkeen käyttäjän
 *     roolin mukaan. Vain opiskelijat (rooli 1) näkevät painikkeen.
 */
function initCompanyProfileButton() {
  const btn = document.getElementById('viewCompanyProfileBtn');
  if (!btn) return;
  const userRole = localStorage.getItem('userRole');
  if (userRole === '1') {
    btn.style.display = 'inline-block';
  } else {
    btn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const positionId = urlParams.get('id') || (typeof getUrlParameter === 'function' ? getUrlParameter('id') : null);

  if (!positionId) {
    console.error('Missing internship ID in URL.');
    return;
  }

  try {
    await loadInternshipDetail(positionId);
  } catch (err) {
    console.error('Detail page initialization failed:', err);
  }

  const quickApplyForm = document.getElementById('quickApplyForm');
  if (quickApplyForm) {
    quickApplyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (window.currentPosition) {
        showToast(`Applied to ${window.currentPosition.title}!`, 'success');
        this.reset();
      }
    });
  }

  // Wire up company profile modal button
  const viewBtn = document.getElementById('viewCompanyProfileBtn');
  if (viewBtn) {
    viewBtn.addEventListener('click', openCompanyProfileModal);
  }

  // Wire up company profile modal close buttons
  const modalClose = document.getElementById('companyProfileModalClose');
  if (modalClose) {
    modalClose.addEventListener('click', function() {
      document.getElementById('companyProfileModal').style.display = 'none';
    });
  }
  const modalCloseBtn = document.getElementById('companyProfileModalCloseBtn');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', function() {
      document.getElementById('companyProfileModal').style.display = 'none';
    });
  }

  // Close on backdrop click
  const modal = document.getElementById('companyProfileModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Wire up company card save/cancel (removed inline onclick)
  const saveCompanyBtn = document.getElementById('saveCompanyBtn');
  if (saveCompanyBtn) saveCompanyBtn.addEventListener('click', saveCompanyProfile);
  const cancelCompanyBtn = document.getElementById('cancelCompanyBtn');
  if (cancelCompanyBtn) cancelCompanyBtn.addEventListener('click', function() { toggleCompanyEdit(false); });

  // Show/hide View Company Profile button based on role
  initCompanyProfileButton();
});