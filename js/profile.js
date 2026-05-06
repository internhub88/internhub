/* ==========================================================
   profile.js — Student & Company profile page logic
   Opiskelija- ja yritysprofiilisivun logiikka
   ========================================================== */

// EN: Digitransit API key for Finnish city autocomplete in the city input field.
//     The free tier is sufficient; no server-side proxy is needed.
// FI: Digitransit API-avain suomalaisen kaupunkiautomaattitäydennyksen kaupunki-syöttökenttää varten.
//     Ilmainen taso riittää; palvelinpuolen välityspalvelinta ei tarvita.
const DIGITRANSIT_API_KEY = '4346b471f4ea41cb923eb2b40556c495';
/* ==========================================
   STUDENT PROFILE (Supabase)
   ========================================== */

/**
 * EN: Formats an ISO date string to DD.MM.YYYY for display in the Finnish UI.
 *     Defined locally in profile.js because this file may be loaded on pages
 *     that do not include script.js.
 * FI: Muotoilee ISO-päivämäärämerkkijonon DD.MM.YYYY-muotoon suomalaista UI:ta varten.
 *     Määritelty paikallisesti profile.js:ssä, koska tämä tiedosto voidaan ladata
 *     sivuilla, jotka eivät sisällä script.js:ää.
 * @param {string} dateString
 * @returns {string}
 */
// Format date to European format DD.MM.YYYY
function formatDateEuropean(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * EN: Saves the user's preferred language both locally (localStorage via setLanguage)
 *     and persistently in the Users table so the preference survives on other devices.
 * FI: Tallentaa käyttäjän kieliasetuksen sekä paikallisesti (localStorage setLanguage-kautta)
 *     että pysyvästi Users-taulukkoon, jotta asetus säilyy muilla laitteilla.
 * @param {'en'|'fi'} lang - EN: language code / FI: kielikoodi
 */
async function savePreferredLang(lang) {
  const session = getCurrentSession();
  if (!session) return;
  setLanguage(lang);
  const { error } = await supabaseClient
    .from('Users')
    .update({ preferred_lang: lang })
    .eq('user_id', session.userId);
  if (error) console.error('Failed to save language preference:', error);
}

// EN: Module-level state — populated by loadStudentProfile() or loadCompanyProfile()
//     and referenced by all edit/save functions on this page.
// FI: Moduulitason tila — täytetään loadStudentProfile()- tai loadCompanyProfile()-funktiolla
//     ja viitataan kaikilla tämän sivun muokkaus/tallennusfunktioilla.
// Current profile data & categories & links
let currentProfile = null;
let currentTeam = []; 
let editingMemberId = null;
let allCategories = [];
let selectedCategoryIds = [];
let currentLinks = [];

/**
 * EN: Main loader for the student profile page. Fires four parallel Supabase
 *     queries (profile, all categories, student's categories, applications) to
 *     avoid waterfall latency. If no profile row exists yet (first-time login
 *     via OAuth or before the trigger ran), it creates an empty one automatically.
 *     After loading, sequentially fills the display, avatar, CV, links, applications
 *     and practice requests.
 * FI: Päälatausfunktio opiskelijan profiilisivulle. Käynnistää neljä rinnakkaista
 *     Supabase-kyselyä (profiili, kaikki kategoriat, opiskelijan kategoriat, hakemukset)
 *     vesiputouksen latenssin välttämiseksi. Jos profiiliriviä ei vielä ole
 *     (ensimmäinen OAuth-kirjautuminen tai ennen triggerin suorittamista), luodaan
 *     tyhjä profiili automaattisesti. Latauksen jälkeen täyttää vuorotellen näytön,
 *     avatarin, CV:n, linkit, hakemukset ja harjoittelupyynnöt.
 */
// ==========================================
// LOAD PROFILE
// ==========================================
async function loadStudentProfile() {
  const session = await validateSession();
  if (!session) return;

  try {
    // EN: Parallel queries reduce load time. The placeholder eq('student_id', 0)
    //     values in studentCatsRes and applicationsRes are overwritten below once
    //     the real profile.id is available — Promise.all requires all queries to
    //     be defined upfront, so placeholders are necessary here.
    // FI: Rinnakkaiset kyselyt vähentävät lataustaikaa. Paikkamerkkinä olevat
    //     eq('student_id', 0)-arvot studentCatsRes:ssä ja applicationsRes:ssä
    //     korvataan alla, kun todellinen profile.id on saatavilla — Promise.all
    //     vaatii kaikkien kyselyiden määrittelyä etukäteen, joten paikkamerkit ovat välttämättömiä.
    // Load profile, categories, and applications in parallel
    const [profileRes, categoriesRes, studentCatsRes, applicationsRes] = await Promise.all([
      supabaseClient
        .from('student_profiles')
        .select('*')
        .eq('user_id', session.userId)
        .single(),
      supabaseClient
        .from('job_categories')
        .select('category_id, title, group_id, job_groups(title)')
        .order('group_id'),
      supabaseClient
        .from('student_categories')
        .select('category_id')
        .eq('student_id', 0), // placeholder, updated below
      supabaseClient
        .from('applications')
        .select('*, positions(title, Companies:company_id(company_name))')
        .eq('student_id', 0) // placeholder, updated below
    ]);

    const profile = profileRes.data;
    allCategories = categoriesRes.data || [];

    if (!profile) {
      console.warn('Profile not found, creating new empty student profile');
      const { data: newProfile, error: createError } = await supabaseClient
        .from('student_profiles')
        .insert({ user_id: session.userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .select('*')
        .single();

      if (createError) {
        console.error('Failed to create student profile:', createError);
        return;
      }

      profile = newProfile;
    }

    currentProfile = profile;
    if (profile.city) localStorage.setItem('userCity', profile.city);
    else localStorage.removeItem('userCity');

    // Load student categories with real student_id
    const { data: studentCats } = await supabaseClient
      .from('student_categories')
      .select('category_id')
      .eq('student_id', profile.id);

    selectedCategoryIds = (studentCats || []).map(sc => sc.category_id);

    // Load applications with real student_id
    const { data: applications } = await supabaseClient
      .from('applications')
      .select('*, positions(title), company_response')
      .eq('student_id', profile.id);

    // Load links
    const { data: links } = await supabaseClient
      .from('Student_links')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at');

    currentLinks = links || [];

    // Fill display mode
    fillDisplayMode(profile, session);
    fillAvatar(profile);
    fillCvInfo(profile);
    fillLinks();
    fillApplications(applications || []);
    await loadPracticeRequests(profile.id);
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

function togglePostEdit(postId, isEditing) {
    const viewDiv = document.getElementById(`view-mode-${postId}`);
    const editDiv = document.getElementById(`edit-mode-${postId}`);
    const inputField = document.getElementById(`input-title-${postId}`);
    const currentTitle = document.getElementById(`title-${postId}`).innerText;

    if (isEditing) {
        viewDiv.style.display = 'none';
        editDiv.style.display = 'block';
        inputField.value = currentTitle; 
    } else {

        viewDiv.style.display = 'block';
        editDiv.style.display = 'none';
    }
}

async function savePost(postId) {
    const newTitle = document.getElementById(`input-title-${postId}`).value;
    
    document.getElementById(`title-${postId}`).innerText = newTitle;
    
    togglePostEdit(postId, false);
    showToast("Position updated!", 'success');
}

/**
 * EN: Populates all read-only display fields on the student profile page.
 *     Uses helper functions setText/setField so each field handles the
 *     "empty → show placeholder" logic in one place. Also renders the
 *     education list and category tags.
 * FI: Täyttää kaikki vain luku -näyttökentät opiskelijan profiilisivulla.
 *     Käyttää setText/setField-apufunktioita, jotta jokaisella kentällä on
 *     "tyhjä → näytä paikkamerkki" -logiikka yhdessä paikassa.
 *     Renderöi myös koulutuksen listan ja kategoriatunnisteet.
 * @param {object} profile - EN: student profile record / FI: opiskelijan profiiilitietue
 * @param {{login: string}} session - EN: current session / FI: nykyinen istunto
 */
// ==========================================
// FILL DISPLAY MODE
// ==========================================
function fillDisplayMode(profile, session) {
  // Header
  const fullName = [(profile.first_name || ''), (profile.last_name || '')].filter(Boolean).join(' ');
  setText('profileName', fullName || session.login);
  setText('profileEmail', session.login);
  setText('profilePhone', profile.phone || '');
  setText('profileCity', profile.city || '');

  // Fields
  setField('dFirstName', profile.first_name);
  setField('dLastName', profile.last_name);
  setField('dBirthDate', formatDateEuropean(profile.birth_date));
  setField('dPhone', profile.phone);
  setField('dCity', profile.city);
  setField('dEducation', profile.type_education);
  setField('dAbout', profile.about);
  setField('dPracticeStart', formatDateEuropean(profile.practice_start));
  setField('dPracticeEnd', formatDateEuropean(profile.practice_end));

  const openEl = document.getElementById('dOpenToOffers');
  if (openEl) {
    openEl.textContent = profile.is_open_to_offers ? 'Yes' : 'No';
    openEl.className = 'profile-field-value';
  }

  if (profile.education_history) {
    updateEducationDisplay(profile.education_history);
} else if (profile.type_education) {
    // Fallback if you only have the old single string
    updateEducationDisplay([{ name: profile.type_education, year: '' }]);
}

  // Categories
  const catContainer = document.getElementById('dCategories');
  if (catContainer) {
    if (selectedCategoryIds.length === 0) {
      catContainer.innerHTML = '<span class="profile-field-value empty">No categories selected</span>';
    } else {
      catContainer.innerHTML = selectedCategoryIds.map(id => {
        const cat = allCategories.find(c => c.category_id === id);
        return cat ? `<span class="category-tag">${cat.title}</span>` : '';
      }).join('');
    }
  }
}

/**
 * EN: Sets the textContent of a DOM element by ID. No-op if the element
 *     doesn't exist (safe for pages that share this JS file).
 * FI: Asettaa DOM-elementin textContent-ominaisuuden ID:n perusteella.
 *     Ei-operaatio, jos elementtiä ei ole (turvallinen sivuilla, jotka jakavat tämän JS-tiedoston).
 * @param {string} id
 * @param {string|null} value
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

/**
 * EN: Sets a profile field element text. When value is falsy the element
 *     gets the 'empty' CSS class and displays "Not specified" so the user
 *     always sees a clear indicator that a field needs to be filled in.
 * FI: Asettaa profiilikenttäelementin tekstin. Kun arvo on tyhjä, elementti
 *     saa 'empty'-CSS-luokan ja näyttää "Ei määritelty", jotta käyttäjä näkee
 *     aina selkeän indikaattorin, että kenttä pitää täyttää.
 * @param {string} id
 * @param {string|null} value
 */
function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = value;
    el.className = 'profile-field-value';
  } else {
    el.textContent = 'Not specified';
    el.className = 'profile-field-value empty';
  }
}

/**
 * EN: Appends a new education input row to the edit-mode education container.
 *     Pre-fills the fields from the data parameter so the same function serves
 *     both "add empty row" (no args) and "edit existing row" (data from profile).
 * FI: Lisää uuden koulutussyöttörivin muokkaustilan koulutuskonttiin.
 *     Täyttää kentät data-parametrista etukäteen, joten sama funktio palvelee
 *     sekä "lisää tyhjä rivi" (ei args) että "muokkaa olemassa olevaa riviä" (data profiilista).
 * @param {{type: string, name: string, year: string}} data
 */
// Function to add a new education input row
function addEducationRow(data = { type: '', name: '', year: '' }) {
  const container = document.getElementById('eEducationContainer');
  const row = document.createElement('div');
  row.className = 'edu-edit-row';
  
  row.innerHTML = `
      <select class="edit-select edu-type">
          <option value="University" ${data.type === 'University' ? 'selected' : ''}>University</option>
          <option value="Vocational" ${data.type === 'Vocational' ? 'selected' : ''}>Vocational</option>
          <option value="High School" ${data.type === 'High School' ? 'selected' : ''}>High School</option>
          <option value="Other" ${data.type === 'Other' ? 'selected' : ''}>Other</option>
      </select>
      <input type="text" class="edit-input edu-name" placeholder="Institution Name" value="${data.name}" />
      <input type="number" class="edit-input edu-year" placeholder="Year" value="${data.year}" min="1900" max="2099" />
      <button type="button" class="link-remove-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  
  container.appendChild(row);
}

// Update your saveProfile function to collect this data
function getEducationData() {
  const rows = document.querySelectorAll('.edu-edit-row');
  const educationEntries = [];
  
  rows.forEach(row => {
      const type = row.querySelector('.edu-type').value;
      const name = row.querySelector('.edu-name').value;
      const year = row.querySelector('.edu-year').value;
      
      if (name) {
          educationEntries.push({ type, name, year });
      }
  });
  
  return educationEntries;
}

// Update your display function to show the list
function updateEducationDisplay(eduData) {
  const displayContainer = document.getElementById('dEducationList');
  if (!displayContainer) return;

  if (!eduData || eduData.length === 0) {
      displayContainer.innerHTML = '<span class="profile-field-value empty">No education added</span>';
      return;
  }

  displayContainer.innerHTML = eduData.map(edu => `
      <div class="edu-display-item" style="margin-bottom: 10px;">
          <div style="font-weight: 600; color: var(--primary-color);">${edu.name}</div>
          <div style="font-size: 0.9rem; color: #666;">${edu.type} ${edu.year ? '• ' + edu.year : ''}</div>
      </div>
  `).join('');
}

/* ----------------------------------------------------------
   COMPANY PROFILE LOGIC
   Yritysprofiililogiikka
   ---------------------------------------------------------- */

/**
 * EN: Fetches the company's team members from 'company_team' and stores them
 *     in the currentTeam array. Called from loadCompanyProfile().
 * FI: Hakee yrityksen tiimin jäsenet 'company_team'-taulukosta ja tallentaa
 *     ne currentTeam-taulukkoon. Kutsutaan loadCompanyProfile()-funktiosta.
 */
async function loadCompanyTeam() {
  if (!currentProfile) return;

  const { data: team, error } = await supabaseClient
    .from('company_team')
    .select('*')
.eq('company_id', parseInt(currentProfile.company_id))

    .order('created_at');
  if (error) console.error('Load team error:', error);
  else currentTeam = team || [];
}

/**
 * Fills both the Edit Mode list and the Public Display card
 */
function fillTeamDisplay() {
    const editContainer = document.getElementById('teamMembersList');
    const displayContainer = document.getElementById('displayTeamList');
    
    // Helper to generate the HTML for each member
    const generateHTML = (member, isEditMode) => `
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <p style="margin: 0; font-weight: 600; font-size: 1.1rem;">${member.name}</p>
                        ${member.is_responsible ? `<span style="font-size:0.72rem; background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:20px; font-weight:600;">${t('companyProfile.memberResponsibleBadge') || '★ Responsible'}</span>` : ''}
                    </div>
                    <p style="margin: 0.2rem 0; color: var(--primary-color); font-weight: 500;">${member.job_title}</p>
                    ${member.email ? `<p style="margin: 0; font-size: 0.85rem; color: var(--text-light);">📧 ${member.email}</p>` : ''}
                    ${member.phone ? `<p style="margin: 0; font-size: 0.85rem; color: var(--text-light);">📞 ${member.phone}</p>` : ''}
                </div>
                ${isEditMode ? `
                <div style="display: flex; gap: 5px;">
                    <button onclick="editTeamMember('${member.id}')" class="btn-small" style="background: var(--secondary-color); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Edit</button>
                    <button onclick="deleteTeamMember('${member.id}')" class="btn-small" style="background:#ef4444; color:white; border:none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Delete</button>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    if (editContainer) {
        editContainer.innerHTML = currentTeam.length ? currentTeam.map(m => generateHTML(m, true)).join('') : '<p>No members yet.</p>';
    }

    if (displayContainer) {
        displayContainer.innerHTML = currentTeam.length ? currentTeam.map(m => generateHTML(m, false)).join('') : '<p>No members listed.</p>';
    }
}

/* ==========================================
   TEAM MANAGEMENT LOGIC
   ========================================== */


/**
 * Shows the inline form and hides the "Add" button
 */
function showAddMemberForm() {
    document.getElementById('newMemberForm').style.display = 'block';
    document.getElementById('addMemberToggleBtn').style.display = 'none';
}

/**
 * Hides the form, clears inputs, and resets the "Edit" state
 */
function hideAddMemberForm() {
    document.getElementById('newMemberForm').style.display = 'none';
    document.getElementById('addMemberToggleBtn').style.display = 'inline-block';
    
    // Reset state
    editingMemberId = null;
    
    // Reset button text
    const confirmBtn = document.querySelector('#newMemberForm button[onclick="saveNewTeamMember()"]');
    if (confirmBtn) confirmBtn.innerText = "Confirm Add";

    // Clear all inputs
    ['nmName', 'nmTitle', 'nmEmail', 'nmPhone'].forEach(id => {
        document.getElementById(id).value = '';
    });
    const nmResp = document.getElementById('nmIsResponsible');
    if (nmResp) nmResp.checked = false;
}

/**
 * Populates the form with existing data to Edit
 */
function editTeamMember(memberId) {
  console.log("Editing member with ID:", memberId); // Debugging
  
  // Convert both to strings to ensure they match
  const member = currentTeam.find(m => String(m.id) === String(memberId));
  
  if (!member) {
      console.error("Member not found in currentTeam array. Check if currentTeam is populated.");
      return;
  }

  // The rest of your code...
  editingMemberId = memberId;
  showAddMemberForm();

  document.getElementById('nmName').value = member.name || '';
  document.getElementById('nmTitle').value = member.job_title || '';
  document.getElementById('nmEmail').value = member.email || '';
  document.getElementById('nmPhone').value = member.phone || '';
  const nmResp = document.getElementById('nmIsResponsible');
  if (nmResp) nmResp.checked = !!member.is_responsible;

  const confirmBtn = document.querySelector('#newMemberForm button[onclick="saveNewTeamMember()"]');
  if (confirmBtn) confirmBtn.innerText = "Update Member";
  
  document.getElementById('newMemberForm').scrollIntoView({ behavior: 'smooth' });
}
/**
 * Saves either a NEW member or UPDATES an existing one
 */
async function saveNewTeamMember() {
    const name = document.getElementById('nmName').value.trim();
    const title = document.getElementById('nmTitle').value.trim();
    const email = document.getElementById('nmEmail').value.trim();
    const phone = document.getElementById('nmPhone').value.trim();

    if (!name || !title) {
        showToast("Name and Job Title are required.", 'warning');
        return;
    }

    const isResponsible = document.getElementById('nmIsResponsible')?.checked || false;

    const memberData = {
        company_id: parseInt(currentProfile.company_id),
        name: name,
        job_title: title,
        email: email,
        phone: phone,
        is_responsible: isResponsible
    };

    try {
        // If marking as responsible, unset any existing responsible member first
        if (isResponsible) {
            await supabaseClient
                .from('company_team')
                .update({ is_responsible: false })
                .eq('company_id', parseInt(currentProfile.company_id));
            currentTeam.forEach(m => { m.is_responsible = false; });
        }

        if (editingMemberId) {
            // --- MODE: UPDATE ---
            const { data, error } = await supabaseClient
                .from('company_team')
                .update(memberData)
                .eq('id', editingMemberId)
                .select();

            if (error) throw error;

            // Update the local list
            const index = currentTeam.findIndex(m => m.id === editingMemberId);
            currentTeam[index] = data[0];
            showToast("Member updated successfully!", 'success');
        } else {
            // --- MODE: INSERT ---
            const { data, error } = await supabaseClient
                .from('company_team')
                .insert([memberData])
                .select();

            if (error) throw error;

            currentTeam.push(data[0]);
            showToast("Member added successfully!", 'success');
        }

        // Refresh UI and close form
        fillTeamDisplay();
        hideAddMemberForm();

    } catch (err) {
        console.error("Database Error:", err.message);
        showToast("Error: " + err.message, 'error');
    }
}

/**
 * Deletes member from DB and UI
 */
async function deleteTeamMember(id) {
    if (!await showConfirm("Are you sure you want to remove this member?", "Remove")) return;

    try {
        const { error } = await supabaseClient
            .from('company_team')
            .delete()
            .eq('id', id);

        if (error) throw error;

        currentTeam = currentTeam.filter(m => m.id !== id);
        fillTeamDisplay();
    } catch (err) {
        console.error("Delete Error:", err);
    }
}

async function loadCompanyProfile() {
  const session = await validateSession();
  if (!session) return;

  try {
    const [profileRes, categoriesRes] = await Promise.all([
      supabaseClient.from('Companies').select('*').eq('user_id', session.userId).single(),
      supabaseClient.from('job_categories').select('category_id, title, group_id, job_groups(title)').order('group_id')
    ]);

    const { data: profile, error } = profileRes;
    allCategories = categoriesRes.data || [];

    if (error) throw error;
    if (profile) {
      // Auto-populate email if missing from Users.user_login
if (!profile.contact_email) {
        const { data: userData } = await supabaseClient
          .from('Users')
          .select('user_login')
          .eq('user_id', session.userId)
          .single();
        
        if (userData && userData.user_login) {
          const emailValue = userData.user_login;
          if (emailValue !== profile.contact_email) {
            const { error: updateError } = await supabaseClient
              .from('Companies')
              .update({ contact_email: emailValue, updated_at: new Date().toISOString() })
              .eq('company_id', profile.company_id);
            
            if (!updateError) {
              profile.contact_email = emailValue;
              console.log('Auto-set company email from Users.user_login:', profile.contact_email);
            } else {
              console.warn('Failed to auto-set email:', updateError.message);
            }
          }
        }
      }
      
      currentProfile = profile; 
      fillCompanyDisplay(profile, session);
      fillCompanyLogo(profile);
      fillCompanyCvInfo();
      await loadCompanyTeam();
      await loadCompanyPostings();
      await loadCompanyApplications();
      fillTeamDisplay();
    }
  } catch (err) {
    console.error('Error loading company:', err.message);
  }
}
// EN: Debounce timer handle for the Finnish Business Registry (PRH) search.
//     Using a timeout instead of immediate fetch prevents hammering the API
//     on every keystroke during typing.
// FI: Debounce-ajastin Suomen kaupparekisterin (PRH) haulle.
//     Aikakatkaisun käyttäminen välittömän haun sijaan estää API:n ylikuormittamisen
//     jokaisella näppäinpainalluksella kirjoittamisen aikana.
let prhSearchTimeout;

/**
 * EN: Searches the Finnish Business Registry (PRH open data API) for company
 *     names or Y-Tunnus numbers. Results populate a datalist for autocomplete.
 *     Uses a proxy (allorigins.win) to bypass CORS since the PRH API doesn't
 *     send Access-Control headers for browser requests.
 * FI: Hakee yrityksen nimiä tai Y-tunnuksia Suomen kaupparekisteristä (PRH avoimen datan API).
 *     Tulokset täyttävät datalist-elementin automaattitäydennystä varten.
 *     Käyttää välityspalvelinta (allorigins.win) CORS:n ohittamiseksi, koska PRH-API
 *     ei lähetä Access-Control-otsikoita selainpyyntöihin.
 * @param {string} query - EN: company name or Y-Tunnus / FI: yrityksen nimi tai Y-tunnus
 */
async function handlePRHSearch(query) {
    const datalist = document.getElementById('prhSuggestions');
    const status = document.getElementById('prhStatus');
    const cleanQuery = query.trim();

    if (!cleanQuery || cleanQuery.length < 3) {
        if (datalist) datalist.innerHTML = '';
        return;
    }

    clearTimeout(prhSearchTimeout);

    prhSearchTimeout = setTimeout(async () => {
        try {
            if (status) status.textContent = "Searching Registry...";

            const isNumeric = /^\d+$/.test(cleanQuery.replace('-', ''));
            const param = isNumeric ? `businessId=${cleanQuery}` : `name=${encodeURIComponent(cleanQuery)}`;
            const targetUrl = `https://avoindata.prh.fi/bis/v1?${param}&maxResults=10`;
            
            // Use a stable proxy
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            
            const response = await fetch(proxyUrl);
            const proxyData = await response.json();
            const data = JSON.parse(proxyData.contents); // AllOrigins wraps the result in 'contents'

            if (datalist) datalist.innerHTML = ''; 

            if (data.results && data.results.length > 0) {
                data.results.forEach(company => {
                    const option = document.createElement('option');
                    option.value = company.businessId; 
                    option.textContent = company.name; 
                    datalist.appendChild(option);
                });
                if (status) status.textContent = `Found ${data.results.length} matches`;
            } else {
                if (status) status.textContent = "No matches found.";
            }
        } catch (err) {
            console.error("PRH API Error:", err);
            if (status) status.textContent = "Search Error. Use manual entry.";
        }
    }, 400);
}
/**
 * EN: Populates the company profile read-only display fields from the profile
 *     object. Uses innerText (not innerHTML) for all assignments to prevent XSS
 *     if company names or descriptions contain HTML-special characters. Falls
 *     back to session.login for the contact email when the profile doesn't have
 *     one (mirrors the fallback in toggleCompanyEdit()).
 * FI: Täyttää yrityksen profiilin vain-luku-näyttökentät profiiliobjektista.
 *     Käyttää innerText:iä (ei innerHTML:ää) kaikissa määrityksissä XSS:n
 *     estämiseksi, jos yrityksen nimet tai kuvaukset sisältävät HTML-erikoismerkkejä.
 *     Palautuu session.login:iin yhteyssähköpostin kohdalla, kun profiilissa
 *     ei ole sellaista (peilaa varavalintaa toggleCompanyEdit():ssä).
 * @param {Object} profile - EN: company profile record / FI: yrityksen profiilitietue
 * @param {Object} session - EN: current session from getCurrentSession() / FI: nykyinen istunto getCurrentSession():sta
 */
// Helper to fill the display text
function fillCompanyDisplay(profile, session) {
    if(document.getElementById('dCompanyName'))
        document.getElementById('dCompanyName').innerText = profile.company_name || '';
    
    if(document.getElementById('dCompanyEmail')) 
        document.getElementById('dCompanyEmail').innerText = profile.contact_email || session.login || 'Not set';
    
    if(document.getElementById('dCompanyDesc')) 
        document.getElementById('dCompanyDesc').innerText = profile.description || '';
    
    if(document.getElementById('dWebsite')) 
        document.getElementById('dWebsite').innerText = profile.website || '';
    
    if(document.getElementById('dHeadquarters')) 
        document.getElementById('dHeadquarters').innerText = profile.city || '';

    if(document.getElementById('dTeamSize'))
        document.getElementById('dTeamSize').innerText = profile.business_id || 'Not set';
}




/**
 * EN: Saves edits to the company profile by updating the Companies table row.
 *     After a successful save, updates the DOM display fields in-place (no reload)
 *     and merges the changes into currentProfile so toggleCompanyEdit() pre-fills
 *     the form correctly on the next edit.
 * FI: Tallentaa muutokset yritysprofiiliin päivittämällä Companies-taulukon rivin.
 *     Onnistuneen tallennuksen jälkeen päivittää DOM-näyttökentät paikallaan (ei uudelleenlatausta)
 *     ja yhdistää muutokset currentProfile-objektiin, jotta toggleCompanyEdit()
 *     täyttää lomakkeen oikein seuraavalla muokkauskerralla.
 */
async function saveCompanyProfile() {
    const session = getCurrentSession(); 
    if (!session) {
        showToast("You must be logged in to save.", 'warning');
        return;
    }

    const saveBtn = document.getElementById('saveCompanyBtn');
    const emailInput = document.getElementById('eCompanyEmail');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving...';
    }

    try {
        const updates = {
            company_name: document.getElementById('eCompanyName').value.trim(),
            contact_email: emailInput ? emailInput.value.trim() : session.login,
            description: document.getElementById('eCompanyDesc').value.trim(),
            website: document.getElementById('eWebsite').value.trim(),
            city: document.getElementById('eHeadquarters').value.trim(),

            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
            .from('Companies') 
            .update(updates)
            .eq('user_id', session.userId); 

        if (error) throw error;

        document.getElementById('dCompanyName').innerText = updates.company_name;
        document.getElementById('dCompanyEmail').innerText = updates.contact_email;
        document.getElementById('dCompanyDesc').innerText = updates.description;
        document.getElementById('dHeadquarters').innerText = updates.city;
        document.getElementById('dTeamSize').innerText = updates.business_id;
        if(document.getElementById('dYTunnus'))
            document.getElementById('dYTunnus').innerText = updates.business_id;
        document.getElementById('dWebsite').innerText = updates.website;

        // Update local cache so toggleCompanyEdit pre-fills correctly next time
        Object.assign(currentProfile, updates);
        toggleCompanyEdit(false);
        showToast("Profile updated successfully!", 'success');

    } catch (err) {
        console.error("Full Save Error:", err);
        showToast("Save failed: " + (err.message || "Unknown error"), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save';
        }
    }
}

/**
 * EN: Opens the "Post Internship" modal in CREATE mode — clears all fields,
 *     sets the modal title to "Create New Internship", and loads the category
 *     select options from the DB.
 * FI: Avaa "Julkaise harjoittelu" -modaalin LUONTI-tilassa — tyhjentää kaikki kentät,
 *     asettaa modaalin otsikon "Luo uusi harjoittelu" -tekstiksi ja lataa
 *     kategoriavalinnat tietokannasta.
 */
// Opens the modal for a NEW position
function openPostModal() {
  const modal = document.getElementById('postJobModal');
  const titleHeader = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitPostBtn');

  if (titleHeader) titleHeader.innerText = "Create New Internship";
  if (submitBtn) submitBtn.innerText = "Post Position";
  document.getElementById('editPositionId').value = ""; // Clear ID

  // Clear form
  document.getElementById('pTitle').value = "";
  document.getElementById('pDesc').value = "";
  document.getElementById('pRespon').value = "";
  document.getElementById('pReqs').value = "";
  document.getElementById('pStart').value = "";
  document.getElementById('pEnd').value = "";
  document.getElementById('pEnd').disabled = false;
  document.getElementById('pOpenEnded').checked = false;
  document.getElementById('pStatus').value = "active";
  document.getElementById('pSpots').value = 1;
  positionSelectedCategoryIds = [];
  renderPosSelectedCategories();
  document.getElementById('pCategorySearch').value = "";
  document.getElementById('posCategoryDropdown').classList.remove('show');

  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

/**
 * EN: Opens the "Post Internship" modal in EDIT mode — fetches the existing
 *     position data, pre-fills all form fields, and sets a hidden editPositionId
 *     input so submitPosition() knows to UPDATE rather than INSERT.
 *     A 100ms setTimeout is used after loading categories to ensure the select
 *     has rendered its options before setting the selected value.
 * FI: Avaa "Julkaise harjoittelu" -modaalin MUOKKAUS-tilassa — hakee olemassa
 *     olevan position datan, täyttää kaikki lomakekentät etukäteen ja asettaa
 *     piilotetun editPositionId-syötteen, jotta submitPosition() tietää
 *     päivittävänsä eikä lisäävänsä. 100ms setTimeout käytetään kategorioiden
 *     lataamisen jälkeen varmistaakseen, että valintaelementti on renderöinyt
 *     vaihtoehdot ennen valitun arvon asettamista.
 * @param {number} id - EN: position ID to edit / FI: muokattava positio-ID
 */
// Opens the modal to EDIT an existing position
async function openEditModal(id) {
  const modal = document.getElementById('postJobModal');
  const titleHeader = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitPostBtn');

  if (titleHeader) titleHeader.innerText = "Edit Internship";
  if (submitBtn) submitBtn.innerText = "Update Position";
  document.getElementById('editPositionId').value = id;

  try {
      const { data, error } = await supabaseClient
          .from('positions')
          .select('*')
          .eq('position_id', id)
          .single();

      if (error) throw error;

      // Fill fields
      document.getElementById('pTitle').value = data.title || "";
      document.getElementById('pDesc').value = data.description || "";
      document.getElementById('pSalary').value = data.salary || "";
      document.getElementById('pRespon').value = data.responsibilities || "";
      document.getElementById('pReqs').value = data.requirements || "";
      document.getElementById('pStatus').value = data.status || "active";
      document.getElementById('pSpots').value = data.spots_total ?? 1;
      document.getElementById('pStart').value = data.period_start || "";
      document.getElementById('pEnd').value = data.period_end || "";
      document.getElementById('pOpenEnded').checked = data.is_open_ended;

      // Load categories from position_categories junction table
      const { data: posCats } = await supabaseClient
          .from('position_categories')
          .select('category_id')
          .eq('position_id', id);
      positionSelectedCategoryIds = (posCats || []).map(pc => pc.category_id);
      document.getElementById('pCategorySearch').value = "";
      renderPosSelectedCategories();

      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
  } catch (err) {
      showToast("Error loading data: " + err.message, 'error');
  }
}

/**
 * EN: Handles both INSERT and UPDATE for internship positions. Checks the
 *     hidden editPositionId field — if set, runs an UPDATE; otherwise INSERT.
 * FI: Käsittelee sekä harjoittelupositioiden INSERT:n että UPDATE:n. Tarkistaa
 *     piilotetun editPositionId-kentän — jos asetettu, suorittaa UPDATE:n; muuten INSERT:n.
 */
// Handles both INSERT and UPDATE
async function submitPosition() {
  const editId = document.getElementById('editPositionId').value;
  const submitBtn = document.getElementById('submitPostBtn');
  
  if (!currentProfile) { showToast("Profile not loaded.", 'warning'); return; }

  const postData = {
      company_id: currentProfile.company_id,
      title: document.getElementById('pTitle').value.trim(),
      description: document.getElementById('pDesc').value,
      responsibilities: document.getElementById('pRespon').value,
      requirements: document.getElementById('pReqs').value,
      salary: document.getElementById('pSalary').value.trim() || null,
      spots_total: parseInt(document.getElementById('pSpots').value) || 1,
      status: document.getElementById('pStatus').value,
      period_start: document.getElementById('pStart').value || null,
      period_end: document.getElementById('pEnd').value || null,
      is_open_ended: document.getElementById('pOpenEnded').checked
  };

  submitBtn.disabled = true;
  submitBtn.innerText = "Saving...";

  try {
      let positionId = editId ? parseInt(editId) : null;

      if (editId) {
          const { error } = await supabaseClient.from('positions').update(postData).eq('position_id', editId);
          if (error) throw error;
      } else {
          const { data: newPos, error } = await supabaseClient.from('positions').insert([postData]).select().single();
          if (error) throw error;
          positionId = newPos.position_id;
      }

      // Sync position_categories junction table
      await supabaseClient.from('position_categories').delete().eq('position_id', positionId);
      if (positionSelectedCategoryIds.length > 0) {
          const catRows = positionSelectedCategoryIds.map(catId => ({ position_id: positionId, category_id: catId }));
          const { error: catError } = await supabaseClient.from('position_categories').insert(catRows);
          if (catError) throw catError;
      }

      showToast(editId ? "Updated!" : "Posted!", 'success');
      closePostModal();
      loadCompanyPostings();
  } catch (err) {
      showToast("Error: " + err.message, 'error');
  } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = editId ? "Update Position" : "Post Position";
  }
}

function closePostModal() {
  const modal = document.getElementById('postJobModal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
  positionSelectedCategoryIds = [];
  const err = document.getElementById('postError');
  if (err) err.style.display = 'none';
}

// Close modal if user clicks the dark background
window.onclick = function(event) {
  const modal = document.getElementById('postJobModal');
  if (event.target == modal) {
      closePostModal();
  }
}

// ==========================================
// POSITION CATEGORY MULTI-SELECT
// ==========================================

function buildPosCategoryDropdown(query) {
  const dropdown = document.getElementById('posCategoryDropdown');
  if (!dropdown) return;
  const q = (query || '').toLowerCase();
  const groups = {};
  allCategories.forEach(cat => {
    if (q && !cat.title.toLowerCase().includes(q)) return;
    const groupTitle = cat.job_groups?.title || 'Other';
    if (!groups[groupTitle]) groups[groupTitle] = [];
    groups[groupTitle].push(cat);
  });
  dropdown.innerHTML = Object.entries(groups).map(([groupTitle, cats]) => `
    <div class="category-group-title">${groupTitle}</div>
    ${cats.map(cat => `
      <div class="category-option${positionSelectedCategoryIds.includes(cat.category_id) ? ' selected' : ''}"
           onclick="togglePosCategory(${cat.category_id})"
           data-cat-title="${cat.title}">
        ${cat.title}
      </div>
    `).join('')}
  `).join('');
}

function showPosCategoryDropdown() {
  buildPosCategoryDropdown(document.getElementById('pCategorySearch').value);
  document.getElementById('posCategoryDropdown').classList.add('show');
}

function filterPosCategories() {
  const query = document.getElementById('pCategorySearch').value;
  buildPosCategoryDropdown(query);
  document.getElementById('posCategoryDropdown').classList.add('show');
}

function togglePosCategory(categoryId) {
  if (positionSelectedCategoryIds.includes(categoryId)) {
    positionSelectedCategoryIds = positionSelectedCategoryIds.filter(id => id !== categoryId);
  } else {
    positionSelectedCategoryIds.push(categoryId);
  }
  renderPosSelectedCategories();
  document.getElementById('posCategoryDropdown').classList.remove('show');
  document.getElementById('pCategorySearch').value = '';
}

function renderPosSelectedCategories() {
  const container = document.getElementById('posSelectedCategories');
  if (!container) return;
  container.innerHTML = positionSelectedCategoryIds.map(id => {
    const cat = allCategories.find(c => c.category_id === id);
    return cat ? `
      <span class="category-tag">
        ${cat.title}
        <button onclick="togglePosCategory(${id})" type="button">×</button>
      </span>
    ` : '';
  }).join('');
}

/**
 * EN: Populates the category <select> in the post/edit modal with <optgroup>
 *     elements grouped by job_groups. Fetching groups+categories in one query
 *     avoids a second round trip.
 * FI: Täyttää kategoria-<select>-elementin julkaisu/muokkausmodaalissa <optgroup>-elementeillä
 *     ryhmiteltyinä job_groups:n mukaan. Ryhmien+kategorioiden hakeminen yhdellä kyselyllä
 *     välttää toisen pyydöksen.
 */
async function loadCategoriesIntoSelect() {
  const select = document.getElementById('pCategory');
  if (!select) return;

  try {
      // Fetch categories and their parent group titles
      const { data, error } = await supabaseClient
          .from('job_groups')
          .select(`
              group_id,
              title,
              job_categories (
                  category_id,
                  title
              )
          `)
          .order('title');

      if (error) throw error;

      // Start with a clean select
      select.innerHTML = '<option value="">Select a category...</option>';

      data.forEach(group => {
          // Create a non-clickable group header (e.g., IT, Design)
          const optGroup = document.createElement('optgroup');
          optGroup.label = group.title;

          // Add the specific categories (e.g., Frontend Developer)
          group.job_categories.forEach(cat => {
              const option = document.createElement('option');
              option.value = cat.category_id;
              option.textContent = cat.title;
              optGroup.appendChild(option);
          });

          select.appendChild(optGroup);
      });
  } catch (err) {
      console.error("Error loading categories:", err.message);
      select.innerHTML = '<option value="">Error loading categories</option>';
  }
}

async function deletePosition(id) {
  if (!await showConfirm("Are you sure you want to delete this posting?", "Delete")) return;

  try {
      const { error } = await supabaseClient
          .from('positions')
          .delete()
          .eq('position_id', id);

      if (error) throw error;
      loadCompanyPostings(); // Refresh the list
  } catch (err) {
      showToast(err.message, 'error');
  }
}

function toggleReqText(id) {
  const shortEl = document.getElementById('req-short-' + id);
  const fullEl  = document.getElementById('req-full-'  + id);
  const btn     = document.getElementById('req-btn-'   + id);
  const isExpanded = fullEl.style.display !== 'none';
  shortEl.style.display = isExpanded ? 'inline' : 'none';
  fullEl.style.display  = isExpanded ? 'none'   : 'inline';
  btn.textContent       = isExpanded ? t('companyProfile.posShowMore') : t('companyProfile.posShowLess');
}

/**
 * EN: Loads all internship postings for the current company, with the application
 *     count aggregated in the same query to avoid a second fetch per position.
 *     Each posting card has an expandable accordion for its applicants so the
 *     company can review them inline without navigating away.
 * FI: Lataa kaikki nykyisen yrityksen harjoittelupaikkailmoitukset, hakemuspisteet
 *     koottuna samaan kyselyyn toisen haun välttämiseksi per positio.
 *     Jokaisen ilmoituskortin alla on laajennettava alue hakijoille, jotta
 *     yritys voi tarkastella niitä paikallaan ilman pois navigoimista.
 */
// --- Load and Display Postings ---
async function loadCompanyPostings() {
  const container = document.getElementById('companyPostingsList');
  if (!container || !currentProfile) return;

  try {
      const { data: positions, error } = await supabaseClient
          .from('positions')
          .select('position_id, title, status, requirements, period_start, period_end, spots_total, applications(count), position_categories(category_id, job_categories(title, group_id))')
          .eq('company_id', currentProfile.company_id)
          .order('created_at', { ascending: false });

      if (error) throw error;

      // Auto-close active positions only when accepted_count >= spots_total
      const activeIds = (positions || []).filter(p => p.status === 'active').map(p => p.position_id);
      if (activeIds.length > 0) {
          const { data: acceptedApps } = await supabaseClient
              .from('applications')
              .select('position_id')
              .eq('status', 'accepted')
              .in('position_id', activeIds);

          const acceptedCountMap = {};
          (acceptedApps || []).forEach(a => {
              acceptedCountMap[a.position_id] = (acceptedCountMap[a.position_id] || 0) + 1;
          });

          // Attach accepted count to each position for use in fillCompanyPostings
          (positions || []).forEach(p => { p._acceptedCount = acceptedCountMap[p.position_id] || 0; });

          const toClose = new Set(
              (positions || [])
                  .filter(p => p.status === 'active' && p._acceptedCount >= (p.spots_total || 1))
                  .map(p => p.position_id)
          );
          if (toClose.size > 0) {
              await supabaseClient.from('positions').update({ status: 'closed' }).in('position_id', [...toClose]);
              (positions || []).forEach(p => { if (toClose.has(p.position_id)) p.status = 'closed'; });
          }
      }

      fillCompanyPostings(positions || []);
  } catch (err) {
      console.error("Error loading postings:", err);
      document.getElementById('companyPostingsList').innerHTML = '<p style="color:red; font-size:0.85rem;">Error loading postings.</p>';
  }
}

function fillCompanyPostings(positions) {
  _lastCompanyPostings = positions;
  const container = document.getElementById('companyPostingsList');
  const showAllWrap = document.getElementById('showAllPostingsWrap');
  if (!container) return;

  if (!positions || positions.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-light); font-size:0.85rem;">${t('companyProfile.postingsEmpty')}</p>`;
      if (showAllWrap) showAllWrap.style.display = 'none';
      return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = positions.filter(p => p.status === 'active' && new Date(p.period_end) >= today);
  const archived = positions.filter(p => p.status !== 'active' || new Date(p.period_end) < today);
  const toShow = showAllPostings ? positions : active;

  const statusColors = {
    active: 'background:#d1fae5;color:#065f46;',
    draft:  'background:#f3f4f6;color:#374151;',
    closed: 'background:#fee2e2;color:#991b1b;'
  };

  positionDataMap = {};
  // Pre-populate positionDataMap for all positions (even archived), needed for matchStudents
  positions.forEach(pos => {
    positionDataMap[pos.position_id] = {
      groupIds:    [...new Set((pos.position_categories || []).map(pc => pc.job_categories?.group_id).filter(Boolean))],
      periodStart: pos.period_start || null,
      periodEnd:   pos.period_end   || null,
    };
  });

  container.innerHTML = toShow.length > 0 ? toShow.map(pos => {
          const appCount = pos.applications?.[0]?.count ?? 0;
          const spotsTotal = pos.spots_total || 1;
          const acceptedCount = pos._acceptedCount || 0;
          const spotsLeft = spotsTotal - acceptedCount;
          const spotsLabel = spotsTotal === 1
              ? (spotsLeft <= 0 ? '0 spots left' : '1 spot')
              : `${spotsLeft > 0 ? spotsLeft : 0} of ${spotsTotal} spots left`;
          const sc = statusColors[pos.status] || '';
          const cats = (pos.position_categories || [])
              .map(pc => `<span class="category-tag" style="font-size:0.75rem; padding:0.2rem 0.5rem;">${pc.job_categories?.title || ''}</span>`)
              .join('');
          return `
          <div class="position-card" id="posting-${pos.position_id}">
            <div class="position-card-inner">
              <div class="position-card-left">
                <h4>${pos.title}</h4>
                ${cats ? `<div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin:0.35rem 0 0.1rem;">${cats}</div>` : ''}
                ${pos.requirements ? `
                <div class="position-reqs-block">
                  <span class="position-reqs-label">${t('companyProfile.postReqsLabel')}</span>
                  <p id="req-${pos.position_id}" style="font-size:0.82rem;color:var(--text-light);margin:0.2rem 0 0;line-height:1.4;">
                    <span id="req-short-${pos.position_id}">${pos.requirements.length > 120 ? pos.requirements.slice(0, 120) + '…' : pos.requirements}</span>
                    ${pos.requirements.length > 120 ? `
                    <span id="req-full-${pos.position_id}" style="display:none;">${pos.requirements}</span>
                    <a href="javascript:void(0)" id="req-btn-${pos.position_id}" onclick="toggleReqText(${pos.position_id})" style="font-size:0.78rem;margin-left:0.25rem;">${t('companyProfile.posShowMore')}</a>` : ''}
                  </p>
                </div>` : ''}
              </div>
              <div class="position-card-right">
                <span class="status-badge" style="${sc}">${pos.status}</span>
                <span style="font-size:0.78rem; color:var(--text-light); white-space:nowrap;">🪑 ${spotsLabel}</span>
                <div class="pos-actions" id="pos-actions-${pos.position_id}">
                  <a href="internship-detail.html?id=${pos.position_id}" class="text-primary">${t('companyProfile.posView')}</a>
                  <a href="javascript:void(0)" onclick="openEditModal(${pos.position_id})" class="text-primary">${t('companyProfile.posEdit')}</a>
                  <a href="javascript:void(0)" onclick="deletePosition(${pos.position_id})" style="color:#dc3545;">${t('companyProfile.posDelete')}</a>
                </div>
              </div>
            </div>
            ${appCount > 0 ? `
            <div class="position-apps-toggle" style="border-top:1px solid #f0f0f0; margin-top:0.5rem; padding-top:0.4rem;">
              <button id="pos-apps-btn-${pos.position_id}" onclick="togglePositionApplicants(${pos.position_id}, ${appCount})"
                style="background:none; border:none; cursor:pointer; color:#6366f1; font-size:0.85rem; font-weight:600; padding:0; display:flex; align-items:center; gap:0.3rem;">
                <span id="pos-apps-arrow-${pos.position_id}">▼</span> 👥 ${t('companyProfile.posApplications')} (${appCount})
              </button>
            </div>
            <div id="pos-apps-${pos.position_id}" style="display:none; padding-top:0.25rem;"></div>` : ''}
            <div class="position-apps-toggle" style="border-top:1px solid #f0f0f0; margin-top:0.5rem; padding-top:0.4rem;">
              <button id="pos-match-btn-${pos.position_id}" onclick="toggleMatchStudents(${pos.position_id})"
                style="background:none; border:none; cursor:pointer; color:#059669; font-size:0.85rem; font-weight:600; padding:0; display:flex; align-items:center; gap:0.3rem;">
                <span id="pos-match-arrow-${pos.position_id}">▼</span> ${t('companyProfile.matchFindBtn')}
              </button>
            </div>
            <div id="pos-match-${pos.position_id}" style="display:none; padding-top:0.25rem;"></div>
          </div>`;
      }).join('')
    : `<p style="text-align:center; color:var(--text-light); font-size:0.85rem;">No active postings.</p>`;

  if (showAllWrap) {
    if (archived.length > 0) {
      showAllWrap.style.display = 'block';
      const btn = document.getElementById('showAllPostingsBtn');
      if (btn) btn.textContent = showAllPostings
        ? 'Show active only'
        : `Show all (${positions.length})`;
    } else {
      showAllWrap.style.display = 'none';
    }
  }
}

/**
 * EN: Fetches and renders all applicants for a single position into a given
 *     container element. Joins student_profiles and Users to show name and email
 *     without a separate query. Shows a loading placeholder immediately so the
 *     user has visual feedback during the network request. Marks container.dataset.loaded
 *     on success so togglePositionApplicants() can skip re-fetching on subsequent
 *     accordion opens.
 * FI: Hakee ja renderöi kaikki hakijat yksittäiselle positiolle annettuun
 *     säiliöelementtiin. Liittää student_profiles- ja Users-taulukot nimen ja
 *     sähköpostin näyttämiseksi ilman erillistä kyselyä. Näyttää latauspaikkamerkin
 *     välittömästi, jotta käyttäjällä on visuaalinen palaute verkkopyynnön aikana.
 *     Merkitsee container.dataset.loaded onnistumisen yhteydessä, jotta
 *     togglePositionApplicants() voi ohittaa uudelleenhaun seuraavissa accordion-avauksissa.
 * @param {number} positionId - EN: positions.position_id to fetch for / FI: positions.position_id, jolle haetaan
 * @param {HTMLElement} container - EN: DOM element to render applicants into / FI: DOM-elementti, johon hakijat renderöidään
 */
async function fetchPositionApplicants(positionId, container) {
  container.innerHTML = '<p style="color:#888; font-size:0.85rem; padding:0.5rem 0;">Loading...</p>';
  try {
    const { data: apps, error } = await supabaseClient
      .from('applications')
      .select('*, interview_date, positions(title), student_profiles(*, Users(user_login))')
      .eq('position_id', positionId)
      .order('applied_at', { ascending: false });

    if (error) throw error;

    if (!apps || apps.length === 0) {
      container.innerHTML = '<p style="color:#888; font-size:0.85rem;">No applications yet.</p>';
      container.dataset.loaded = 'true';
      return;
    }

    container.innerHTML = apps.map(app => {
      const status       = app.status || 'pending';
      const studentName  = app.student_profiles ? `${app.student_profiles.first_name || ''} ${app.student_profiles.last_name || ''}`.trim() || 'Applicant' : 'Applicant';
      const studentEmail = app.student_profiles?.email || app.student_profiles?.Users?.user_login || '';
      const appliedDate  = formatDateEuropean(app.applied_at);
      const existingDate = app.interview_date || '';
      const isCompanyMatch = app.initiated_by === 'company';
      const favIcon    = app.is_favorited ? '<span style="color:#dc2626;" title="Favourited">♥</span> ' : '';
      const sourceBadge = isCompanyMatch
        ? `<span style="background:#f0f9ff;color:#0369a1;font-size:0.72rem;padding:0.1rem 0.45rem;border-radius:9999px;border:1px solid #bae6fd;margin-left:0.4rem;">${t('companyProfile.matchBadgeCompany')}</span>`
        : '';
      const interviewBtn = app.interview_date
        ? `<button class="btn btn-small" style="font-size:0.78rem; background:#d1fae5; color:#065f46;" onclick="scheduleInterviewProfile('${studentName}', '${studentEmail}', '${app.positions?.title || ''}', ${app.application_id}, '${existingDate}')">${t('pages.internshipDetail.scheduledBtn')}</button>`
        : `<button class="btn btn-small btn-primary" style="font-size:0.78rem;" onclick="scheduleInterviewProfile('${studentName}', '${studentEmail}', '${app.positions?.title || ''}', ${app.application_id}, '')">${t('pages.internshipDetail.scheduleInterviewBtn')}</button>`;
      const viewBtn = isCompanyMatch
        ? `<button class="btn btn-small btn-view" onclick="openStudentProfileModal(${app.student_id}, null, null, ${app.position_id})">${t('pages.internshipDetail.viewBtn')}</button>`
        : `<button class="btn btn-small btn-view" onclick="openCompanyAppModal(${JSON.stringify(app).replace(/"/g, '&quot;')})">${t('pages.internshipDetail.viewBtn')}</button>`;
      const sp = app.student_profiles;
      const photoUrl = sp?.photo_url || '';
      const initials = [(sp?.first_name || ''), (sp?.last_name || '')].map(n => n.charAt(0).toUpperCase()).join('') || '?';
      const avatarInner = photoUrl
        ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;">`
        : `<span style="font-size:0.85rem;font-weight:700;color:white;">${initials}</span>`;
      return `
        <div style="display:flex; gap:0.75rem; align-items:flex-start; padding:0.75rem 0; border-top:2px solid #e2e8f0;">
          <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,#4f46e5,#10b981);display:flex;align-items:center;justify-content:center;">
            ${avatarInner}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex; align-items:center; gap:0.25rem; flex-wrap:wrap;">
              <p style="margin:0; font-weight:600; color:#374151;">${favIcon}${studentName}</p>
              ${sourceBadge}
            </div>
            <p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">${studentEmail}</p>
            ${isCompanyMatch ? '' : `<p style="margin:0.15rem 0 0; font-size:0.78rem; color:#9ca3af;">${t('pages.internshipDetail.appliedLabel')} ${appliedDate}</p>`}
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; margin-top:0.4rem; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <span class="status-badge status-${status}">${status.replace('_', ' ')}</span>
                ${app.interview_date ? `<span style="font-size:0.78rem; color:#059669;">📅 ${formatDateEuropean(app.interview_date)} ${new Date(app.interview_date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
              </div>
              <div style="display:flex; gap:0.4rem; flex-shrink:0;">
                ${viewBtn}
                ${interviewBtn}
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    container.dataset.loaded = 'true';
  } catch (err) {
    container.innerHTML = `<p style="color:red; font-size:0.85rem;">Error: ${err.message}</p>`;
  }
}

/**
 * EN: Toggles the accordion panel for a specific position's applicants.
 *     On first open, fetches the data and caches it (dataset.loaded) so
 *     subsequent toggles don't re-query the DB.
 * FI: Vaihtaa tietyn position hakijoiden accordion-paneelin tilaa.
 *     Ensimmäisellä avauksella hakee datan ja välimuistittaa sen (dataset.loaded),
 *     jotta seuraavat vaihdot eivät kysy tietokantaa uudelleen.
 * @param {number} positionId
 * @param {number} appCount - EN: used to avoid fetch when 0 / FI: käytetään välttämään hakua, kun 0
 */
async function togglePositionApplicants(positionId, appCount) {
  const container = document.getElementById(`pos-apps-${positionId}`);
  const arrow     = document.getElementById(`pos-apps-arrow-${positionId}`);
  const actions   = document.getElementById(`pos-actions-${positionId}`);
  if (!container) return;

  const isOpen = container.dataset.open === 'true';
  if (isOpen) {
    container.style.display = 'none';
    container.dataset.open = 'false';
    arrow.textContent = '▼';
    if (actions) actions.style.display = '';
    return;
  }

  container.style.display = 'block';
  container.dataset.open = 'true';
  arrow.textContent = '▲';
  if (actions) actions.style.display = 'none';

  if (container.dataset.loaded) return;

  await fetchPositionApplicants(positionId, container);
}

async function toggleMatchStudents(positionId) {
  const container = document.getElementById(`pos-match-${positionId}`);
  const arrow     = document.getElementById(`pos-match-arrow-${positionId}`);
  const actions   = document.getElementById(`pos-actions-${positionId}`);
  if (!container) return;

  const isOpen = container.dataset.open === 'true';
  if (isOpen) {
    container.style.display = 'none';
    container.dataset.open = 'false';
    if (arrow) arrow.textContent = '▼';
    if (actions) actions.style.display = '';
    return;
  }

  container.style.display = 'block';
  container.dataset.open = 'true';
  if (arrow) arrow.textContent = '▲';
  if (actions) actions.style.display = 'none';

  if (container.dataset.loaded) return;
  await fetchMatchingStudents(positionId, container);
}

async function fetchMatchingStudents(positionId, container) {
  container.innerHTML = '<p style="color:#888; font-size:0.85rem; padding:0.5rem 0;">Searching for matching students…</p>';

  const posData    = positionDataMap[positionId];
  const companyCity = (currentProfile?.city || '').toLowerCase().trim();

  try {
    const [{ data: requests, error }, { data: companyApps }] = await Promise.all([
      supabaseClient
        .from('student_practice_requests')
        .select(`
          request_id, period_start, period_end,
          student_profiles!inner(id, first_name, last_name, city, Users:user_id(user_login)),
          student_request_categories(category_id, job_categories(title, group_id))
        `)
        .eq('status', 'searching'),
      supabaseClient
        .from('applications')
        .select('student_id, status, is_favorited, interview_date')
        .eq('position_id', positionId)
        .eq('initiated_by', 'company')
    ]);

    if (error) throw error;

    // Map student_id → company action state
    const companyActionMap = {};
    (companyApps || []).forEach(a => { companyActionMap[a.student_id] = a; });

    const posGroupIds  = new Set(posData?.groupIds || []);
    const posStart     = posData?.periodStart ? new Date(posData.periodStart) : null;
    const posEnd       = posData?.periodEnd   ? new Date(posData.periodEnd)   : null;

    const matches = (requests || []).filter(r => {
      const sp = r.student_profiles;

      // City match
      const studentCity = (sp?.city || '').toLowerCase().trim();
      const cityMatch = !companyCity || !studentCity || studentCity === companyCity;

      // Period overlap ≥ 50% of student's request period
      let overlapMatch = true;
      if (posStart && posEnd && r.period_start && r.period_end) {
        const rStart   = new Date(r.period_start);
        const rEnd     = new Date(r.period_end);
        const overlapMs = Math.max(0, Math.min(posEnd, rEnd) - Math.max(posStart, rStart));
        const reqMs     = rEnd - rStart;
        overlapMatch    = reqMs === 0 || (overlapMs / reqMs) >= 0.5;
      }

      // Group match — at least one shared top-level group
      let groupMatch = posGroupIds.size === 0;
      if (!groupMatch) {
        groupMatch = (r.student_request_categories || []).some(sc =>
          sc.job_categories?.group_id && posGroupIds.has(sc.job_categories.group_id)
        );
      }

      if (!(cityMatch && overlapMatch && groupMatch)) return false;

      // Hide students already moved to applications (favourited or interview scheduled)
      const ca = companyActionMap[sp?.id];
      if (ca && (ca.is_favorited || ca.interview_date)) return false;

      return true;
    });

    if (matches.length === 0) {
      container.innerHTML = `<p style="color:#888; font-size:0.85rem; padding:0.5rem 0;">${t('companyProfile.matchEmpty')}</p>`;
      container.dataset.loaded = 'true';
      return;
    }

    container.innerHTML = matches.map(r => {
      const sp          = r.student_profiles;
      const city        = sp?.city || '';
      const cityMatch   = !companyCity || city.toLowerCase().trim() === companyCity;
      const name        = `${sp?.first_name || ''} ${sp?.last_name || ''}`.trim() || 'Student';
      const periodText  = r.period_start && r.period_end
        ? `${formatDateEuropean(r.period_start)} – ${formatDateEuropean(r.period_end)}`
        : '—';
      const catChips    = (r.student_request_categories || [])
        .map(sc => `<span class="category-tag" style="font-size:0.72rem; padding:0.15rem 0.45rem;">${sc.job_categories?.title || ''}</span>`)
        .join('');
      const ca          = companyActionMap[sp?.id];
      const viewedBadge = (ca && ca.status === 'viewed')
        ? `<span style="font-size:0.72rem; color:#059669; margin-left:0.4rem;">${t('companyProfile.matchBadgeViewed')}</span>`
        : '';

      return `
        <div style="padding:0.6rem 0; border-top:1px solid #f3f4f6;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; flex-wrap:wrap;">
            <div>
              <p style="margin:0; font-weight:600; color:#374151;">${name}${viewedBadge}</p>
              ${city ? `<p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">📍 ${city} ${cityMatch ? '<span style="color:#059669;">✓</span>' : ''}</p>` : ''}
              <p style="margin:0.1rem 0 0; font-size:0.82rem; color:#6b7280;">📅 ${periodText}</p>
              ${catChips ? `<div style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.35rem;">${catChips}</div>` : ''}
            </div>
            <div style="display:flex; gap:0.4rem; flex-shrink:0; align-items:flex-start; flex-wrap:wrap;">
              <button class="btn btn-small btn-view" onclick="openStudentProfileModal(${sp?.id}, '${r.period_start || ''}', '${r.period_end || ''}', ${positionId})">View</button>
            </div>
          </div>
        </div>`;
    }).join('');

    container.dataset.loaded = 'true';
  } catch (err) {
    console.error('[fetchMatchingStudents]', err);
    container.innerHTML = `<p style="color:red; font-size:0.85rem;">Error: ${err.message}</p>`;
  }
}

/**
 * EN: Loads all applications for the logged-in company by first fetching its
 *     position IDs, then querying applications filtered by those IDs. Uses a
 *     two-step query rather than a JOIN because the company_id is not stored
 *     directly on the applications table — only position_id is. Early-exits with
 *     an empty-state message if the company has no positions at all.
 * FI: Lataa kaikki kirjautuneen yrityksen hakemukset hakemalla ensin sen
 *     positioiden ID:t, sitten kyselemällä hakemuksia suodatettuna niillä ID:illä.
 *     Käyttää kaksivaiheista kyselyä JOIN:n sijaan, koska company_id:tä ei tallenneta
 *     suoraan applications-taulukkoon — vain position_id on siellä. Palaa aikaisin
 *     tyhjän tilan viestiin, jos yrityksellä ei ole lainkaan positioita.
 */
async function loadCompanyApplications() {
  const container = document.getElementById('companyApplicationsContainer');
  if (!container || !currentProfile) return;

  try {
    const { data: positions, error: posErr } = await supabaseClient
      .from('positions')
      .select('position_id')
      .eq('company_id', currentProfile.company_id);

    if (posErr) throw posErr;

    const positionIds = (positions || []).map(p => p.position_id);
    if (!positionIds.length) {
      container.innerHTML = '<p style="color: var(--text-light); text-align: center;">No applications yet.</p>';
      return;
    }

const { data: apps, error: appErr } = await supabaseClient
  .from('applications')
  .select('*, positions(title), student_profiles(photo_url, first_name, last_name, phone, Users:user_id(user_login))')
  .in('position_id', positionIds)
  .order('applied_at', { ascending: false });

    if (appErr) throw appErr;

    fillCompanyApplications(apps || []);
  } catch (err) {
    console.error('Error loading company applications:', err);
    container.innerHTML = '<p style="color: var(--text-light); text-align: center;">Unable to load applications.</p>';
  }
}

/**
 * EN: Renders the company's received applications list into #companyApplicationsContainer.
 *     Each card shows applicant name, email, position title, applied date, status badge,
 *     and interview date if scheduled. The interview button switches between "Schedule"
 *     and "Scheduled" based on whether interview_date is set, providing a clear CTA
 *     without requiring a separate column or modal state check.
 * FI: Renderöi yrityksen vastaanottamat hakemukset #companyApplicationsContainer-elementtiin.
 *     Jokainen kortti näyttää hakijan nimen, sähköpostin, position otsikon, hakupäivän,
 *     tilapalkin ja haastattelun päivämäärän jos aikataulutettu. Haastattelu-painike
 *     vaihtuu "Aikatauluta":n ja "Aikataulutettu":n välillä sen mukaan, onko interview_date
 *     asetettu, tarjoten selkeän CTA:n ilman erillistä saraketta tai modaalin tilatarkistusta.
 * @param {Object[]} applications - EN: array of application records with joined student/position data / FI: hakemustietueiden taulukko liitetyillä opiskelija-/positiotiedoilla
 */
function fillCompanyApplications(applications) {
  _lastCompanyApplications = applications;
  const container = document.getElementById('companyApplicationsContainer');
  if (!container) return;

  if (!applications || applications.length === 0) {
    container.innerHTML = '<p style="color: var(--text-light); text-align: center;">No applications yet.</p>';
    return;
  }

  container.innerHTML = applications.map(app => {
    const appData = JSON.stringify(app).replace(/"/g, '&quot;');
    const status  = app.status || 'pending';

    const responseSnippet = app.company_response
      ? `<div style="margin-top:0.5rem; color:#555;"><strong>Response:</strong> ${app.company_response}</div>`
      : '';

    // ── student / position data ──────────────────────────────────
    const studentFullName = app.student_profiles
      ? (`${app.student_profiles.first_name || ''} ${app.student_profiles.last_name || ''}`).trim() || 'Applicant'
      : 'Applicant';
const studentEmail = app.student_profiles?.Users?.user_login || '';
    const positionTitle = app.positions?.title || 'Position';

    // ── safe versions for data attributes (no quotes) ────────────
    const safeName     = studentFullName.replace(/"/g, '').replace(/'/g, '');
    const safeEmail    = studentEmail.replace(/"/g, '').replace(/'/g, '');
    const safePosition = positionTitle.replace(/"/g, '').replace(/'/g, '');

    // ── interview date display ───────────────────────────────────
    const interviewDate = app.interview_date
      ? `<p style="margin:0.4rem 0 0; font-size:0.85rem; color:#059669;">
           📅 Interview: ${formatDateEuropean(app.interview_date)}
           ${new Date(app.interview_date).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})}
         </p>`
      : '';

    // ── schedule/reschedule button ───────────────────────────────
    const existingDate = app.interview_date || '';
    const interviewBtn = app.interview_date
      ? `<button class="btn btn-small" style="font-size:0.78rem; background:#d1fae5; color:#065f46;"
               onclick="scheduleInterviewProfile(' ${app.application_id}, '${existingDate}')">
           ${t('pages.internshipDetail.scheduledBtn')}
         </button>`
      : `<button class="btn btn-small btn-primary" style="font-size:0.78rem;"
               onclick="scheduleInterviewProfile(' ${app.application_id}, '')">
           ${t('pages.internshipDetail.scheduleInterviewBtn')}
         </button>`;

    

    // ── accept button (only show if not yet accepted) ────────────
    const acceptBtn = (status === 'pending' || status === 'reviewing')
  ? `<button class="btn btn-small btn-primary"
             style="font-size:0.78rem; background:#4f46e5;"
             data-appid="${app.application_id}"
             data-name="${safeName}"
             data-email="${safeEmail}"
             data-position="${safePosition}"
             onclick="openAcceptModal(this)">
       ✅ Accept
     </button>`
  : '';

    return `
      <div class="application-card" id="company-app-${app.application_id}"
           style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
        <div style="min-width:0; flex:1;">
          <h5 style="margin:0 0 0.5rem 0; font-size:1rem;">${positionTitle}</h5>
          <p style="margin:0; color:#374151; font-weight:600;">${studentFullName}</p>
          <p style="margin:0.25rem 0 0; font-size:0.9rem; color:#6b7280;">
            ${studentEmail}${app.student_profiles?.phone ? ' · ' + app.student_profiles.phone : ''}
          </p>
          <p style="margin:0.75rem 0 0; font-size:0.85rem; color:#6b7280;">
            ${t('pages.internshipDetail.appliedLabel')} ${formatDateEuropean(app.applied_at)}
          </p>
          <p style="margin:0.4rem 0 0; font-size:0.85rem;">
            ${t('pages.internshipDetail.statusLabel')}
            <span class="status-badge status-${status}">${status}</span>
          </p>
          ${interviewDate}
          ${responseSnippet}
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:flex-start;">
          <button class="btn btn-view" onclick="openCompanyAppModal(${appData})">
            ${t('pages.internshipDetail.viewBtn')}
          </button>
          ${acceptBtn}
          ${interviewBtn}
        </div>
      </div>
    `;
  }).join('');
}
/**
 * EN: Converts a Date object to a string in the format required by
 *     <input type="datetime-local"> (YYYY-MM-DDTHH:mm). Uses local time
 *     components (getFullYear, getMonth, etc.) rather than UTC equivalents
 *     so the displayed time matches the company's local timezone, which is
 *     important for scheduling interviews with Finnish students/companies.
 * FI: Muuntaa Date-objektin <input type="datetime-local"> -elementin vaatimaan
 *     muotoon (YYYY-MM-DDTHH:mm). Käyttää paikallisia aikakomponentteja
 *     (getFullYear, getMonth jne.) UTC-vastineiden sijaan, jotta näytetty
 *     aika vastaa yrityksen paikallista aikavyöhykettä, mikä on tärkeää
 *     haastattelujen aikatauluttamisessa suomalaisten opiskelijoiden/yritysten kanssa.
 * @param {Date} date - EN: Date object to format / FI: muotoiltava Date-objekti
 * @returns {string} EN: local datetime string for input value / FI: paikallinen datetime-merkkijono syötteen arvoksi
 */
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * EN: Opens (or lazily creates) the interview scheduling modal for a specific
 *     application. The modal is created dynamically on first call and reused
 *     thereafter to avoid duplicate DOM nodes. Attaches the application context
 *     to modal._data so confirmInterviewSchedule() and cancelInterviewProfile()
 *     can read it without needing it passed as function arguments. When
 *     existingDate is provided (rescheduling), pre-fills the input with the
 *     current date and shows the Cancel Interview button; otherwise defaults
 *     to tomorrow at 10:00.
 * FI: Avaa (tai luo laiskasti) haastattelun aikataulutusmodaalin tietylle
 *     hakemukselle. Modaali luodaan dynaamisesti ensimmäisellä kutsulla ja
 *     käytetään uudelleen sen jälkeen välttäen päällekkäisiä DOM-solmuja.
 *     Liittää hakemuskontekstin modal._data-kenttään, jotta confirmInterviewSchedule()
 *     ja cancelInterviewProfile() voivat lukea sen ilman, että se täytyy välittää
 *     funktioargumentteina. Kun existingDate on annettu (uudelleenaikatauluttaminen),
 *     esitäyttää syötteen nykyisellä päivämäärällä ja näyttää Peruuta haastattelu
 *     -painikkeen; muuten oletuksena huomenna klo 10:00.
 * @param {string} fullName - EN: applicant's full name for the modal description / FI: hakijan koko nimi modaalin kuvaukseen
 * @param {string} email - EN: applicant's email for Calendar link generation / FI: hakijan sähköposti kalenterilinkin generointiin
 * @param {string} positionTitle - EN: position title for the modal description / FI: position otsikko modaalin kuvaukseen
 * @param {number} applicationId - EN: application_id to update on confirm / FI: application_id päivitettäväksi vahvistuksen yhteydessä
 * @param {string} existingDate - EN: ISO date string if rescheduling, empty if new / FI: ISO-päivämäärämerkkijono uudelleenaikatauluttaessa, tyhjä uudelle
 */
function scheduleInterviewProfile(fullName, email, positionTitle, applicationId, existingDate) {
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
          <button class="btn btn-primary" onclick="confirmInterviewSchedule()">${t('pages.internshipDetail.confirmCalendarBtn')}</button>
          <button id="cancelInterviewBtn" class="btn btn-outline" style="color:#dc2626;border-color:#dc2626;display:none;" onclick="cancelInterviewProfile()">${t('pages.internshipDetail.cancelInterviewBtn')}</button>
          <button class="btn btn-outline" onclick="document.getElementById('interviewDateModal').style.display='none'">${t('pages.internshipDetail.closeBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal._data = { fullName, email, positionTitle, applicationId };
  document.getElementById('interviewModalDesc').textContent = `${fullName} — ${positionTitle}`;
  document.getElementById('interviewModalTitle').textContent = existingDate ? t('pages.internshipDetail.rescheduleInterviewTitle') : t('pages.internshipDetail.scheduleInterviewTitle');
  document.getElementById('cancelInterviewBtn').style.display = existingDate ? 'inline-block' : 'none';

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
 * EN: Cancels a previously scheduled interview by setting interview_date to null
 *     and resetting the application status to 'pending'. Reads applicationId from
 *     modal._data (set by scheduleInterviewProfile) so the function needs no
 *     parameters. Reloads company applications after update to refresh all cards.
 * FI: Peruuttaa aiemmin aikataulutetun haastattelun asettamalla interview_date:n
 *     nulliksi ja palauttamalla hakemuksen statuksen 'pending'-tilaan. Lukee
 *     applicationId:n modal._data-kentästä (asetettu scheduleInterviewProfile:lla),
 *     joten funktio ei tarvitse parametreja. Lataa yrityksen hakemukset uudelleen
 *     päivityksen jälkeen kaikkien korttien päivittämiseksi.
 */
async function cancelInterviewProfile() {
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
    await loadCompanyApplications();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/**
 * EN: Confirms the interview date, saves it to Supabase, and opens Google Calendar
 *     with pre-filled event details. The date is stored as UTC ISO string
 *     (date.toISOString()) so it is timezone-agnostic in the DB. The Calendar URL
 *     uses the same UTC timestamp in the compact format (YYYYMMDDTHHmmssZ) required
 *     by the Google Calendar API. A 60-minute duration is assumed for all interviews.
 *     The Calendar link opens in a new tab so the profile page stays open.
 * FI: Vahvistaa haastattelun päivämäärän, tallentaa sen Supabaseen ja avaa Google
 *     Kalenterin esitäytetyillä tapahtumatiedoilla. Päivämäärä tallennetaan UTC
 *     ISO-merkkijonona (date.toISOString()), jotta se on aikavyöhykkeistä riippumaton
 *     DB:ssä. Kalenteri-URL käyttää samaa UTC-aikaleimaa kompaktissa muodossa
 *     (YYYYMMDDTHHmmssZ), jonka Google Calendar API vaatii. Kaikille haastatteluille
 *     oletetaan 60 minuutin kesto. Kalenteri-linkki avautuu uudessa välilehdessä,
 *     jotta profiilisivu pysyy auki.
 */
async function confirmInterviewSchedule() {
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
    await loadCompanyApplications();
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
 * EN: Opens the company's view of a single application in a modal. Fills all
 *     modal fields from the already-loaded application object (no extra DB query).
 *     Stores application_id and student_id in hidden form fields so that the
 *     "Save Status" and "View Student Profile" buttons can read them without
 *     needing JS closure references or global variables.
 * FI: Avaa yrityksen näkymän yksittäiseen hakemukseen modaalissa. Täyttää kaikki
 *     modaalikentät jo ladatusta hakemuksesta (ei ylimääräistä DB-kyselyä).
 *     Tallentaa application_id:n ja student_id:n piilotettuihin lomakekenttiin,
 *     jotta "Tallenna tila"- ja "Näytä opiskelijan profiili" -painikkeet voivat
 *     lukea ne ilman JS-sulkeuma-viittauksia tai globaaleja muuttujia.
 * @param {Object} app - EN: application record with joined student/position data / FI: hakemustietue liitetyillä opiskelija-/positiotiedoilla
 */
function openCompanyAppModal(app) {
  console.log('openCompanyAppModal app:', app);
  console.log('student_profiles:', app.student_profiles);
  console.log('positions:', app.positions);
  const modal = document.getElementById('companyAppModal');
  if (!modal) return;

  document.getElementById('companyAppId').value = app.application_id;

  const studentIdEl = document.getElementById('companyAppStudentId');
  if (studentIdEl) studentIdEl.value = app.student_id || '';

  const positionIdEl = document.getElementById('companyAppPositionId');
  if (positionIdEl) positionIdEl.value = app.position_id || '';

  document.getElementById('companyAppPosition').textContent = app.positions?.title || 'Position';
  const sp = app.student_profiles || {};
  const fullName = `${sp.first_name || ''} ${sp.last_name || ''}`.trim() || 'Applicant';
  document.getElementById('companyAppName').textContent = fullName;
document.getElementById('companyAppEmail').textContent = 
  sp.contact_email || sp.email || sp.Users?.user_login || 'No email provided';
  document.getElementById('companyAppPhone').textContent = sp.phone || 'No phone provided';
  document.getElementById('companyAppStatus').textContent = app.status || 'pending';
  document.getElementById('companyAppCoverLetter').textContent = app.cover_letter || 'No cover letter provided.';

  const cvLink = document.getElementById('companyAppCvLink');
  if (cvLink) {
    cvLink.innerHTML = app.cv_url
      ? `<a href="${app.cv_url}" target="_blank" rel="noreferrer noopener">Download CV (${app.cv_original_name || 'Resume.pdf'})</a>`
      : 'No CV uploaded.';
  }

  document.getElementById('companyAppResponse').value = app.company_response || '';
  modal.style.display = 'block';
}

/**
 * EN: Opens a read-only modal showing a student's full profile to a company
 *     reviewer. Fetches profile, categories, and links in parallel. Displays
 *     education, practice period, open-to-offers status, categories, links,
 *     and CV download button.
 * FI: Avaa vain luku -modaalin, joka näyttää opiskelijan täyden profiilin
 *     yrityksen tarkastajalle. Hakee profiilin, kategoriat ja linkit rinnakkain.
 *     Näyttää koulutuksen, harjoittelujakson, avoimuuden tarjouksille, kategoriat,
 *     linkit ja CV-latauslinkin.
 * @param {number} studentId - EN: student profile ID / FI: opiskelijan profiili-ID
 */
// ==========================================
// STUDENT PROFILE MODAL (read-only, for company reviewers)
// ==========================================
async function openStudentProfileModal(studentId, requestPeriodStart = null, requestPeriodEnd = null, positionId = null) {
  if (!studentId) { showToast('No student ID available.', 'warning'); return; }

  _spPositionId   = positionId || null;
  _spStudentId    = studentId;
  _spAppId        = null;
  _spStudentEmail = '';

  const modal   = document.getElementById('studentProfileModal');
  const loading = document.getElementById('spLoading');
  const content = document.getElementById('spContent');
  const errorEl = document.getElementById('spError');
  if (!modal) return;

  // Reset to loading state
  modal.style.display = 'block';
  loading.style.display = 'block';
  content.style.display = 'none';
  errorEl.style.display  = 'none';

  try {
    // Fetch profile, categories and links in parallel
    const [profileRes, catsRes, linksRes] = await Promise.all([
      supabaseClient.from('student_profiles').select('*, Users:user_id(user_login)').eq('id', studentId).single(),
      supabaseClient.from('student_categories')
        .select('category_id, job_categories(title)')
        .eq('student_id', studentId),
      supabaseClient.from('Student_links')
        .select('*').eq('student_id', studentId).order('created_at')
    ]);

    if (profileRes.error || !profileRes.data) throw new Error('Profile not found');

    const p     = profileRes.data;
    const cats  = catsRes.data  || [];
    const links = linksRes.data || [];

    _spStudentEmail = p.Users?.user_login || '';

    // --- Avatar ---
    const avatarEl = document.getElementById('spAvatar');
    if (p.photo_url) {
      avatarEl.innerHTML = `<img src="${p.photo_url}" style="width:100%;height:100%;object-fit:cover;" />`;
    } else {
      const initials = [(p.first_name || ''), (p.last_name || '')]
        .map(n => n.charAt(0).toUpperCase()).join('') || '👤';
      avatarEl.textContent = initials;
    }

    // --- Name / city / phone ---
    document.getElementById('spFullName').textContent =
      `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown Applicant';
    document.getElementById('spCity').textContent  = p.city  ? `📍 ${p.city}`  : '';
    document.getElementById('spPhone').textContent = p.phone ? `📞 ${p.phone}` : '';

    // --- About ---
    const aboutWrap = document.getElementById('spAboutWrap');
    document.getElementById('spAbout').textContent = p.about || 'No description provided.';
    aboutWrap.style.display = p.about ? '' : 'none';

    // --- Education ---
    const eduEl   = document.getElementById('spEdu');
    const eduWrap = document.getElementById('spEduWrap');
    const eduData = p.education_history;
    if (Array.isArray(eduData) && eduData.length > 0) {
      eduEl.innerHTML = eduData.map(e => `
        <div style="padding:0.35rem 0; border-bottom:1px solid #f3f4f6; display:flex; gap:0.5rem; align-items:baseline;">
          <span style="font-weight:600; color:#1f2937;">${e.name}</span>
          <span style="font-size:0.82rem; color:#6b7280;">${e.type || ''}${e.year ? ' · ' + e.year : ''}</span>
        </div>`).join('');
    } else if (p.type_education) {
      eduEl.innerHTML = `<span style="color:#374151;">${p.type_education}</span>`;
    } else {
      eduWrap.style.display = 'none';
    }

    // --- Practice period (prefer request period if passed, fall back to profile fields) ---
    const periodStart = requestPeriodStart || p.practice_start;
    const periodEnd   = requestPeriodEnd   || p.practice_end;
    document.getElementById('spPractice').textContent =
      (periodStart || periodEnd)
        ? `${formatDateEuropean(periodStart)} – ${formatDateEuropean(periodEnd)}`
        : 'Not specified';
    document.getElementById('spOpen').innerHTML = p.is_open_to_offers
      ? '<span style="color:#059669; font-weight:600;">✅ Open to offers</span>'
      : '<span style="color:#6b7280;">Not currently open to offers</span>';

    // --- Categories ---
    const catsEl   = document.getElementById('spCats');
    const catsWrap = document.getElementById('spCatsWrap');
    if (cats.length > 0) {
      catsEl.innerHTML = cats.map(c =>
        `<span style="background:#eef2ff; color:#4f46e5; padding:0.25rem 0.65rem; border-radius:2rem; font-size:0.82rem; font-weight:600;">${c.job_categories?.title || ''}</span>`
      ).join('');
    } else {
      catsWrap.style.display = 'none';
    }

    // --- Links ---
    const linksEl   = document.getElementById('spLinks');
    const linksWrap = document.getElementById('spLinksWrap');
    const LINK_ICONS_SP = { github:'🔗', linkedin:'👤', portfolio:'🌐', other:'🔗' };
    if (links.length > 0) {
      linksEl.innerHTML = links.map(l =>
        `<div style="margin-bottom:0.3rem;">${LINK_ICONS_SP[l.link_type] || '🔗'} <a href="${l.url}" target="_blank" rel="noopener" style="color:#4f46e5;">${l.label || l.link_type}</a></div>`
      ).join('');
    } else {
      linksWrap.style.display = 'none';
    }

    // --- CV ---
    const cvEl   = document.getElementById('spCv');
    const cvWrap = document.getElementById('spCvWrap');
    if (p.cv_url) {
      cvEl.innerHTML = `<a href="${p.cv_url}" target="_blank" class="btn btn-small btn-primary">⬇ Download CV (${p.cv_original_name || 'Resume.pdf'})</a>`;
    } else {
      cvEl.textContent = 'No CV uploaded.';
      cvWrap.style.background = '#f9fafb';
      cvWrap.style.borderColor = '#e5e7eb';
    }

    // Action buttons (only when opened from a specific position context)
    await _renderSpActions();

    // Show content
    loading.style.display = 'none';
    content.style.display = 'block';

  } catch (err) {
    console.error('openStudentProfileModal error:', err);
    loading.style.display = 'none';
    errorEl.style.display  = 'block';
  }
}

async function _renderSpActions() {
  const old = document.getElementById('spActionsSection');
  if (old) old.remove();
  if (!_spPositionId) return;

  const { data } = await supabaseClient
    .from('applications')
    .select('application_id, status, is_favorited, interview_date')
    .eq('position_id', _spPositionId)
    .eq('student_id',  _spStudentId)
    .eq('initiated_by', 'company')
    .maybeSingle();

  _spAppId = data?.application_id || null;

  const isFav        = data?.is_favorited || false;
  const isViewed     = !!(data && data.status && data.status !== 'pending');
  const hasInterview = !!data?.interview_date;

  const section = document.createElement('div');
  section.id = 'spActionsSection';
  section.style.cssText = 'margin-top:1.5rem; padding-top:1.25rem; border-top:2px solid #f3f4f6;';
  section.innerHTML = `
    <p style="margin:0 0 0.75rem; font-weight:700; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.06em; color:#9ca3af;">${t('companyProfile.matchActionsTitle')}</p>
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
      <button id="spFavBtn" onclick="spToggleFavorite()"
        class="btn btn-small"
        style="${isFav ? 'background:#fef2f2;color:#dc2626;border-color:#fecaca;' : ''}">
        ${isFav ? t('companyProfile.matchFavourited') : t('companyProfile.matchFavourite')}
      </button>
      <button id="spViewedBtn" onclick="spMarkViewed()"
        class="btn btn-small"
        style="${isViewed ? 'background:#f0fdf4;color:#059669;border-color:#bbf7d0;' : ''}">
        ${isViewed ? t('companyProfile.matchViewed') : t('companyProfile.matchMarkViewed')}
      </button>
      <button id="spInterviewBtn" onclick="spInviteInterview()"
        class="btn btn-small ${hasInterview ? '' : 'btn-primary'}"
        style="${hasInterview ? 'background:#d1fae5;color:#065f46;' : ''}">
        ${hasInterview ? t('companyProfile.matchInviteScheduled') : t('companyProfile.matchInvite')}
      </button>
    </div>`;
  document.getElementById('spContent').appendChild(section);
}

async function ensureCompanyApp() {
  if (_spAppId) return _spAppId;
  const { data: existing } = await supabaseClient
    .from('applications')
    .select('application_id')
    .eq('position_id',  _spPositionId)
    .eq('student_id',   _spStudentId)
    .eq('initiated_by', 'company')
    .maybeSingle();
  if (existing) { _spAppId = existing.application_id; return _spAppId; }
  const { data, error } = await supabaseClient
    .from('applications')
    .insert({ position_id: _spPositionId, student_id: _spStudentId, initiated_by: 'company', status: 'pending', applied_at: new Date().toISOString() })
    .select('application_id')
    .single();
  if (error) throw error;
  _spAppId = data.application_id;
  await _refreshPositionApplicants(_spPositionId);
  return _spAppId;
}

async function spToggleFavorite() {
  try {
    const appId = await ensureCompanyApp();
    const btn = document.getElementById('spFavBtn');
    const nowFav = btn.textContent.trim().startsWith('♡');
    await supabaseClient.from('applications').update({ is_favorited: nowFav }).eq('application_id', appId);
    btn.innerHTML = nowFav ? t('companyProfile.matchFavourited') : t('companyProfile.matchFavourite');
    btn.style.cssText = nowFav ? 'background:#fef2f2;color:#dc2626;border-color:#fecaca;' : '';
    await _refreshPositionApplicants(_spPositionId);
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function spMarkViewed() {
  try {
    const appId = await ensureCompanyApp();
    await supabaseClient.from('applications').update({ status: 'viewed' }).eq('application_id', appId);
    const btn = document.getElementById('spViewedBtn');
    btn.innerHTML = t('companyProfile.matchViewed');
    btn.style.cssText = 'background:#f0fdf4;color:#059669;border-color:#bbf7d0;';
    await _refreshPositionApplicants(_spPositionId);
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function spInviteInterview() {
  try {
    const appId    = await ensureCompanyApp();
    const name     = document.getElementById('spFullName')?.textContent || 'Student';
    const posTitle = document.querySelector(`#posting-${_spPositionId} h4`)?.textContent || 'Position';
    scheduleInterviewProfile(name, _spStudentEmail, posTitle, appId, '');
    const interviewModal = document.getElementById('interviewDateModal');
    if (interviewModal) interviewModal.style.zIndex = '12000';
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function _refreshPositionApplicants(positionId) {
  // Refresh applicants accordion
  const appsContainer = document.getElementById(`pos-apps-${positionId}`);
  if (!appsContainer) { await loadCompanyPostings(); return; }
  delete appsContainer.dataset.loaded;
  if (appsContainer.dataset.open === 'true') await fetchPositionApplicants(positionId, appsContainer);

  // Refresh matching students accordion (force reload so viewed/moved students update)
  const matchContainer = document.getElementById(`pos-match-${positionId}`);
  if (matchContainer) {
    delete matchContainer.dataset.loaded;
    if (matchContainer.dataset.open === 'true') await fetchMatchingStudents(positionId, matchContainer);
  }
}

/**
 * EN: Updates an application's status and optional company_response from the
 *     company application review modal. After saving, refreshes all open accordion
 *     panels and the main applications container so the change is reflected
 *     everywhere without a page reload.
 * FI: Päivittää hakemuksen tilan ja valinnaisen company_response-kentän
 *     yrityksen hakemuksen tarkistusmodaalista. Tallennuksen jälkeen päivittää
 *     kaikki avoimet accordion-paneelit ja pääsovelluskontterin, jotta muutos
 *     näkyy kaikkialla ilman sivun uudelleenlatausta.
 * @param {string} newStatus - EN: new status value / FI: uusi tilanarvo
 */
async function saveCompanyApplicationStatus(newStatus) {
  const appId = document.getElementById('companyAppId').value;
  const response = document.getElementById('companyAppResponse').value;
  const modal = document.getElementById('companyAppModal');

  if (!appId) return;

  try {
    const updatedData = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (response !== undefined) {
      updatedData.company_response = response;
    }

    const { error } = await supabaseClient
      .from('applications')
      .update(updatedData)
      .eq('application_id', parseInt(appId, 10));

    if (error) {
      console.error('Company application update error:', error);
      showToast('Failed to update application: ' + error.message, 'error');
      return;
    }

    if (newStatus === 'accepted') {
      const positionId = document.getElementById('companyAppPositionId')?.value;
      if (positionId) {
        await supabaseClient.from('positions').update({ status: 'closed' }).eq('position_id', parseInt(positionId, 10));
      }
    }

    if ((newStatus === 'accepted' || newStatus === 'rejected') && typeof emailjs !== 'undefined') {
      const studentId = document.getElementById('companyAppStudentId')?.value;
      const positionTitle = document.getElementById('companyAppPosition')?.textContent || '';
      if (studentId) {
        const { data: studentInfo } = await supabaseClient
          .from('student_profiles')
          .select('first_name, last_name, Users:user_id(user_login)')
          .eq('id', parseInt(studentId, 10))
          .single();
        const studentEmail = studentInfo?.Users?.user_login;
        const studentName = [studentInfo?.first_name, studentInfo?.last_name].filter(Boolean).join(' ') || 'Student';
        if (studentEmail) {
          const responsible = currentTeam.find(m => m.is_responsible);
          const companyEmail = currentProfile?.contact_email || '';
          const companyName  = currentProfile?.company_name || '';
          const contactBlock = responsible
            ? `feel free to contact our manager:\n\n${responsible.name}${responsible.job_title ? ', ' + responsible.job_title : ''}\n${responsible.phone ? '📞 ' + responsible.phone + '\n' : ''}📧 ${responsible.email || companyEmail}`
            : `feel free to contact us:\n\n📧 ${companyEmail}`;

          const emailSubject = newStatus === 'accepted'
            ? `Your application for ${positionTitle} at ${companyName} — Good news!`
            : `Your application for ${positionTitle} at ${companyName}`;

          const emailBody = newStatus === 'accepted'
            ? `Hi ${studentName},\n\nWe have reviewed your application for the position of ${positionTitle} at ${companyName} and are happy to let you know that your candidacy has been approved!\n\nWe will be in touch with you shortly to schedule an interview.\n\nIf you have any questions in the meantime, ${contactBlock}\n\nWe look forward to speaking with you!\n\nBest regards,\n${companyName}`
            : `Dear ${studentName},\n\nWe appreciate your interest in ${companyName} and the time you've invested in applying for the ${positionTitle} position.\n\nWe always strive to find candidates who best meet the requirements for a specific position and make decisions based on a variety of factors, including experience, skills and qualifications.\n\nYour CV has been reviewed carefully, but unfortunately we are unable to offer you a position in our company at this time. We always try to find some alternative, but right now there is nothing suitable.\n\nWe wish you to find your dream job!\n\nBest regards,\n${companyName} team`;

          emailjs.send('service_gix61gn', 'template_app_accepted', {
            to_email:      studentEmail,
            email_subject: emailSubject,
            email_body:    emailBody,
            company_logo:  currentProfile?.logo_url?.split('?')[0] || ''
          }).catch(err => console.error('[Email] status notification failed:', err));
        }
      }
    }

    showToast(newStatus === 'accepted' ? 'Application accepted.' : newStatus === 'rejected' ? 'Application declined.' : 'Application updated.', newStatus === 'accepted' ? 'success' : newStatus === 'rejected' ? 'success' : 'info');
    if (modal) modal.style.display = 'none';

    // EN: Re-fetch only the currently open accordion panels so the status badge
    //     updates immediately. Closed panels have their loaded cache cleared so
    //     they re-fetch on next open.
    // FI: Hakee uudelleen vain tällä hetkellä avoimet accordion-paneelit, jotta
    //     tila-merkki päivittyy välittömästi. Suljetuilla paneeleilla tyhjennetään
    //     ladattu välimuisti, jotta ne hakevat uudelleen seuraavalla avauksella.
    // Refresh open position-specific accordion panels
    const openPanels = document.querySelectorAll('[id^="pos-apps-"][data-open="true"]');
    openPanels.forEach(panel => {
      const positionId = panel.id.replace('pos-apps-', '');
      delete panel.dataset.loaded;
      fetchPositionApplicants(positionId, panel);
    });
    // Clear cache on closed panels so they re-fetch on next open
    document.querySelectorAll('[id^="pos-apps-"]').forEach(el => delete el.dataset.loaded);

    await loadCompanyApplications();
  } catch (err) {
    console.error('Error saving company application status:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Accept modal state ──────────────────────────────────────────
let _acceptModalData = {};   // { applicationId, studentName, studentEmail, positionTitle }

/**
 * Called when company clicks the Accept button on an application card.
 * Opens the accept modal instead of accepting immediately.
 */


function openAcceptModalFromReview() {
  // Read data from the currently open companyAppModal
  const appId    = document.getElementById('companyAppId').value;
  const name     = document.getElementById('companyAppName').textContent;
  const email    = document.getElementById('companyAppEmail').textContent;
  const position = document.getElementById('companyAppPosition').textContent;

  console.log('openAcceptModalFromReview — appId:', appId, 'name:', name);

  // Close the review modal
  document.getElementById('companyAppModal').style.display = 'none';

  // Set the accept modal data
  _acceptModalData = {
    applicationId: appId,
    studentName:   name,
    studentEmail:  email,
    positionTitle: position,
  };

  document.getElementById('acceptModalDesc').textContent =
    (name || '?') + ' — ' + (position || '?');

  document.getElementById('acceptInterviewDateWrap').style.display = 'none';
  document.getElementById('acceptWithInterviewBtn').textContent = '📅 Accept & Schedule Interview';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  document.getElementById('acceptInterviewDateInput').value = toLocalInputValue(tomorrow);

  // Show accept modal
  document.getElementById('acceptModal').style.display = 'flex';
}

function closeAcceptModal() {
  document.getElementById('acceptModal').style.display = 'none';
}

function openAcceptModal(btn) {
  document.getElementById('companyAppModal').style.display = 'none';

  const appId    = btn.getAttribute('data-appid');
  const name     = btn.getAttribute('data-name');
  const email    = btn.getAttribute('data-email');
  const position = btn.getAttribute('data-position');

  console.log('openAcceptModal — appId:', appId, 'name:', name);

  _acceptModalData = {
    applicationId: appId,
    studentName:   name,
    studentEmail:  email,
    positionTitle: position,
  };

  document.getElementById('acceptModalDesc').textContent =
    (name || '?') + ' — ' + (position || '?');

  document.getElementById('acceptInterviewDateWrap').style.display = 'none';
  document.getElementById('acceptWithInterviewBtn').textContent = '📅 Accept & Schedule Interview';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  document.getElementById('acceptInterviewDateInput').value = toLocalInputValue(tomorrow);

  document.getElementById('acceptModal').style.display = 'flex';
}
/**
 * Toggles the date picker visible and changes the button to "Confirm".
 * On second click (date picker already visible) → confirms and saves.
 */
function handleAcceptWithInterview() {
  const wrap = document.getElementById('acceptInterviewDateWrap');
  const btn  = document.getElementById('acceptWithInterviewBtn');

  if (wrap.style.display === 'none') {
    // First click → show the date picker
    wrap.style.display = 'block';
    btn.textContent = 'Confirm Interview Date';
  } else {
    // Second click → validate and save
    const dateValue = document.getElementById('acceptInterviewDateInput').value;
    if (!dateValue) {
      showToast('Please select a date and time.', 'error');
      return;
    }
    saveAcceptDecision(dateValue);
  }
}

/**
 * Accept without scheduling an interview — just sets status to 'accepted'.
 */
function handleAcceptOnly() {
  saveAcceptDecision(null);
}

/**
 * Saves the accept decision to Supabase.
 * @param {string|null} dateValue - ISO datetime string, or null for no interview
 */
async function saveAcceptDecision(dateValue) {
  closeAcceptModal();

  const { applicationId, studentName, studentEmail, positionTitle } = _acceptModalData;

  console.log('saveAcceptDecision — raw applicationId:', applicationId);

  const appId = Number(applicationId);

  if (!applicationId || isNaN(appId)) {
    showToast('Error: invalid application ID — ' + applicationId, 'error');
    return;
  }

  const updatePayload = {
    status: 'accepted',
    interview_date: dateValue ? new Date(dateValue).toISOString() : null,
  };

  try {
    const { error } = await supabaseClient
      .from('applications')
      .update(updatePayload)
      .eq('application_id', appId);

    if (error) throw error;

    if (dateValue) {
      showToast('Application accepted & interview scheduled!', 'success');
      const date    = new Date(dateValue);
      const endDate = new Date(date.getTime() + 60 * 60 * 1000);
      const fmt     = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const title   = encodeURIComponent(`Internship Interview - ${studentName}`);
      const details = encodeURIComponent(`Interview with ${studentName} for ${positionTitle}`);
      const guest   = encodeURIComponent(studentEmail);
      const calUrl  = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(date)}/${fmt(endDate)}&add=${guest}`;
      window.open(calUrl, '_blank');
    } else {
      showToast('Application accepted!', 'success');
    }

    await loadCompanyApplications();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function updateDeclineCounter(textarea) {
  const count = textarea.value.length;
  const el = document.getElementById('declineCharCount');
  el.textContent = count;
  el.style.color = count >= 180 ? '#dc2626' : '#9ca3af';
}

function openDeclineModal() {
  const name     = document.getElementById('companyAppName').textContent;
  const position = document.getElementById('companyAppPosition').textContent;

  document.getElementById('declineModalDesc').textContent =
    (name || '?') + ' — ' + (position || '?');

  // Clear previous response text
  document.getElementById('declineResponseText').value = '';
  document.getElementById('declineCharCount').textContent = '0';
  

  // Close the review modal, open the decline modal
  document.getElementById('companyAppModal').style.display = 'none';
  document.getElementById('declineModal').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', function () {
  const textarea = document.getElementById('declineResponseText');
  if (textarea) {
    textarea.addEventListener('input', function () {
      const count = this.value.length;
      const el = document.getElementById('declineCharCount');
      if (!el) return;
      el.textContent = count;
      el.style.color = count >= 180 ? '#dc2626' : '#9ca3af';
    });
  }
});

function closeDeclineModal() {
  document.getElementById('declineModal').style.display = 'none';
}

async function confirmDecline() {
  const appId    = document.getElementById('companyAppId').value;
  const response = document.getElementById('declineResponseText').value.trim();

  if (!appId) {
    showToast('Error: no application selected.', 'error');
    return;
  }

  closeDeclineModal();

  try {
    const { error } = await supabaseClient
      .from('applications')
      .update({
        status:           'rejected',
        company_response: response || null,
        updated_at:       new Date().toISOString(),
      })
      .eq('application_id', parseInt(appId, 10));

    if (error) throw error;

    showToast('Application declined.', 'success');
    await loadCompanyApplications();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}
/**
 * EN: Switches a specific position card between view mode and inline-edit mode
 *     using the position ID to find the corresponding view/edit DOM sections.
 *     Note: this is a second definition — the first togglePostEdit (line ~172)
 *     handles posting status. This variant handles the company postings list rows.
 * FI: Vaihtaa tietyn position kortin näyttötilan ja inline-muokkaustilan välillä
 *     käyttäen position ID:tä löytääkseen vastaavat näyttö/muokkaus-DOM-osiot.
 *     Huomio: tämä on toinen määritelmä — ensimmäinen togglePostEdit (rivi ~172)
 *     käsittelee julkaisun tilan. Tämä variantti käsittelee yrityksen postauslistauksen rivejä.
 * @param {number} id - EN: position_id for the row to toggle / FI: rivin position_id, jota vaihdetaan
 * @param {boolean} show - EN: true = show edit mode, false = show view mode / FI: true = näytä muokkaustila, false = näytä näyttötila
 */
// --- Toggle Edit for a specific job row ---
function togglePostEdit(id, show) {
  document.getElementById(`view-mode-${id}`).style.display = show ? 'none' : 'block';
  document.getElementById(`edit-mode-${id}`).style.display = show ? 'block' : 'none';
}

/**
 * EN: Handles the position form submission for both create (INSERT) and update
 *     (UPDATE) operations from the post modal. Reads the editPositionId hidden
 *     field to decide which operation to perform — empty string means INSERT,
 *     a value means UPDATE. Disables the submit button during the async call to
 *     prevent duplicate submissions, and re-enables it in the finally block
 *     regardless of outcome.
 * FI: Käsittelee position-lomakkeen lähetyksen sekä luonti- (INSERT) että
 *     päivitys- (UPDATE) operaatioille postausmodaalista. Lukee editPositionId-
 *     piilotetun kentän päättääkseen mitä operaatiota suoritetaan — tyhjä
 *     merkkijono tarkoittaa INSERT:iä, arvo tarkoittaa UPDATE:a. Poistaa
 *     lähetyspainikkeen käytöstä asynkronisen kutsun aikana päällekkäisten
 *     lähetysten estämiseksi, ja ottaa sen uudelleen käyttöön finally-lohkossa
 *     tuloksesta riippumatta.
 */
async function handleFormSubmit() {
  const editId = document.getElementById('editPositionId').value;
  const submitBtn = document.getElementById('submitPostBtn');
  
  const postData = {
      company_id: currentProfile.company_id,
      title: document.getElementById('pTitle').value.trim(),
      description: document.getElementById('pDesc').value,
      status: document.getElementById('pStatus').value,
      category_id: document.getElementById('pCategory').value ? parseInt(document.getElementById('pCategory').value) : null,
      period_start: document.getElementById('pStart').value || null,
      period_end: document.getElementById('pEnd').value || null,
      is_open_ended: document.getElementById('pOpenEnded').checked
  };

  submitBtn.disabled = true;

  try {
      let result;
      if (editId) {
          // UPDATE existing row
          result = await supabaseClient
              .from('positions')
              .update(postData)
              .eq('position_id', editId);
      } else {
          // INSERT new row
          result = await supabaseClient
              .from('positions')
              .insert([postData]);
      }

      if (result.error) throw result.error;

      showToast(editId ? "Updated!" : "Posted!", 'success');
      closePostModal();
      loadCompanyPostings(); // Refresh the list

  } catch (err) {
      showToast("Error: " + err.message, 'error');
  } finally {
      submitBtn.disabled = false;
  }
}

/**
 * EN: Updates the company logo in the navigation bar after a logo upload.
 *     Appends a cache-busting timestamp to the URL so the browser fetches the
 *     new image rather than serving the old one from its HTTP cache.
 * FI: Päivittää yrityksen logon navigointipalkkiin logon latauksen jälkeen.
 *     Lisää välimuistin ohittavan aikaleiman URL:ään, jotta selain hakee
 *     uuden kuvan palvelematta vanhaa HTTP-välimuististaan.
 * @param {string} url - EN: public storage URL of the new logo / FI: uuden logon julkinen tallennuksen URL
 */
function updateNavLogo(url) {
  const navLogo = document.getElementById('navCompanyLogo'); // Ensure this ID is in your header
  if (navLogo) {
      // Add a timestamp to the URL to force a refresh
      navLogo.src = `${url}?t=${new Date().getTime()}`;
      navLogo.style.display = 'block';
  }
}

/**
 * EN: Renders the company logo in all logo display locations on the profile page:
 *     the main avatar image (#avatarImg), the company logo div (#companyLogoDiv),
 *     and the nav bar (via initUserMenu). Strips existing cache-busting query
 *     params from the stored URL before re-adding a fresh timestamp, preventing
 *     query-string accumulation on repeated calls. Falls back to showing
 *     placeholders (emoji icon + placeholder divs) when no logo URL is set.
 * FI: Renderöi yrityksen logon kaikissa logon näyttöpaikoissa profiilisivulla:
 *     pää-avatar-kuva (#avatarImg), yrityksen logo-div (#companyLogoDiv) ja
 *     navigointipalkki (initUserMenu-kautta). Poistaa olemassa olevat
 *     välimuistin ohittavat kyselyparametrit tallennetusta URL:sta ennen
 *     uuden aikaleiman uudelleenlisäämistä, estäen kyselymerkkijonon kertymisen
 *     toistuvilla kutsuilla. Palaa näyttämään paikkamerkit (emoji-kuvake +
 *     placeholder-divit), kun logo-URL:tä ei ole asetettu.
 * @param {Object} profile - EN: company profile object with optional logo_url / FI: yrityksen profiiliobjekti valinnaisella logo_url-kentällä
 */
function fillCompanyLogo(profile) {
  const avatarImg = document.getElementById('avatarImg');
  const avatarPlaceholder = document.getElementById('avatarPlaceholder');
  const companyLogoDiv = document.getElementById('companyLogoDiv');
  const companyLogoPlaceholder = document.getElementById('companyLogoPlaceholder');

  if (profile && profile.logo_url) {
    const freshUrl = `${profile.logo_url.split('?')[0]}?t=${new Date().getTime()}`;

    if (avatarImg) {
      avatarImg.src = freshUrl;
      avatarImg.style.display = 'block';
      avatarImg.style.objectFit = 'cover';
    }
    if (avatarPlaceholder) {
      avatarPlaceholder.style.display = 'none';
    }

    if (companyLogoDiv) {
      companyLogoDiv.style.backgroundImage = `url('${freshUrl}')`;
      companyLogoDiv.style.backgroundSize = 'cover';
      companyLogoDiv.style.backgroundPosition = 'center';
      companyLogoDiv.textContent = '';
    }
    if (companyLogoPlaceholder) {
      companyLogoPlaceholder.style.display = 'none';
    }

    if (typeof initUserMenu === 'function') {
      initUserMenu();
    }
    return;
  }

  // If profile has no logo, show placeholders
  if (companyLogoDiv) {
    companyLogoDiv.style.backgroundImage = '';
    companyLogoDiv.textContent = '🏢';
  }
  if (companyLogoPlaceholder) {
    companyLogoPlaceholder.style.display = '';
  }
}
// ==========================================
// FILL APPLICATIONS
// ==========================================
// ==========================================
// APPLICATIONS MANAGEMENT
// ==========================================

/**
 * EN: Renders the student's submitted applications list in #applicationsContainer.
 *     Each card shows position title, status badge, and action buttons. The
 *     full application object is JSON-serialized into an HTML attribute for the
 *     Edit button's onclick — quotes are HTML-escaped (&quot;) to avoid breaking
 *     the attribute string. The View button navigates to the position detail page.
 * FI: Renderöi opiskelijan lähetettyjen hakemusten listan #applicationsContainer-elementtiin.
 *     Jokainen kortti näyttää position otsikon, tilan palkin ja toimintopainikkeet.
 *     Koko hakemuksesta on JSON-serialisoitu HTML-attribuuttiin Muokkaa-painikkeen
 *     onclick-kutsua varten — lainaukset on HTML-paettu (&quot;) välttämään
 *     attribuuttimerkkijonon rikkoutumisen. Näytä-painike siirtyy position yksityiskohtasivulle.
 * @param {Object[]} applications - EN: array of application records with joined position data / FI: hakemustietueiden taulukko liitetyillä positiotiedoilla
 */
function fillApplications(applications) {
  const container = document.getElementById('applicationsContainer');
  if (!container) return;

  if (!applications || applications.length === 0) {
      container.innerHTML = '<p>No applications yet.</p>';
      return;
  }


const renderCard = (app) => {
  // store the response for this app
  if (app.company_response) {
    _appResponseMap[app.application_id] = app.company_response;
  }
      const jobTitle = app.positions?.title || 'Unknown Position';
      const appData = JSON.stringify(app).replace(/"/g, '&quot;');
      return `
          <div class="application-card" id="app-${app.application_id}">
              <div class="app-info">
                  <h5>${jobTitle}</h5>
                  <p style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    Status: <span class="status-badge status-${(app.status || 'pending').toLowerCase()}">${app.status || 'Pending'}</span>
                    ${app.company_response
                      ? `<button onclick="showCompanyResponse(${app.application_id})" 
                                style="background:none; border:none; cursor:pointer; padding:0; 
                                        line-height:1; color:#6b7280;" title="View company message">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" 
                                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" 
                                stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/>
                            <line x1="12" y1="8" x2="12.01" y2="8"/>
                          </svg>
                        </button>`
                      : ''}
                  </p>
              </div>
              <div class="app-actions" style="display: flex; gap: 8px; margin-top: 10px;">
                  <button class="btn-view" onclick="viewApplication(${app.position_id})">View</button>
                  <button class="btn-view" style="background:#f3f4f6; color:#374151;" onclick="openEditAppModal(${appData})">Edit</button>
                  <button class="btn-delete" onclick="deleteApplication(${app.application_id})">Delete</button>
              </div>
          </div>
      `;
  };

  const studentApps = applications.filter(a => a.initiated_by !== 'company');
  const companyApps = applications.filter(a => a.initiated_by === 'company');

  let html = studentApps.map(renderCard).join('');

  if (companyApps.length > 0) {
      if (studentApps.length > 0) html += '<hr style="margin:10px 0; border:none; border-top:1px solid #e5e7eb;">';
      html += `<p style="font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:6px;">${t('studentProfile.companyInvitationsLabel')}</p>`;
      html += companyApps.map(renderCard).join('');
  }

  container.innerHTML = html;
}
const _appResponseMap = {};

function showCompanyResponse(applicationId) {
  const message = _appResponseMap[applicationId];
  if (!message) return;

  let modal = document.getElementById('companyResponseModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'companyResponseModal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:11000; align-items:center; justify-content:center;';
    modal.innerHTML = `
  <div style="background:#fff; padding:1.75rem; border-radius:12px; width:90%;
              max-width:460px; box-shadow:0 10px 25px rgba(0,0,0,0.2); position:relative;">
    <button onclick="document.getElementById('companyResponseModal').style.display='none'"
            style="position:absolute; top:0.75rem; right:0.75rem; background:none;
                   border:none; font-size:1.5rem; cursor:pointer; color:#9ca3af;">&times;</button>
    <h4 style="margin:0 0 0.75rem 0; color:#374151;">📨 Company Response</h4>
    <div id="declineCharDisplay"
         style="font-size:0.78rem; color:#9ca3af; text-align:right; margin-bottom:0.4rem;"></div>
    <p id="companyResponseText"
       style="margin:0; color:#374151; white-space:pre-wrap; line-height:1.65;
              background:#f8fafc; padding:1rem; border-radius:8px;
              border:1px solid #e5e7eb; font-size:0.95rem; word-break:break-word;"></p>
    <button onclick="document.getElementById('companyResponseModal').style.display='none'"
            class="btn btn-secondary"
            style="margin-top:1.25rem; width:100%;">Close</button>
  </div>
`;
    document.body.appendChild(modal);
  }

  const textEl = document.getElementById('companyResponseText');
  const countEl = document.getElementById('declineCharDisplay');

  textEl.textContent = message;

  modal.style.display = 'flex';
}

/**
 * EN: Opens the student application edit modal, pre-filling all fields with
 *     the current application data. Calls renderCvEditSection() to show the
 *     existing CV file (if any) or an upload prompt. isCvDeleted is reset
 *     implicitly by renderCvEditSection since the CV data is re-provided.
 * FI: Avaa opiskelijan hakemuksen muokkausmodaalin esitäyttäen kaikki kentät
 *     nykyisillä hakemustiedoilla. Kutsuu renderCvEditSection():tä näyttääkseen
 *     olemassa olevan CV-tiedoston (jos olemassa) tai latauskehotteen.
 *     isCvDeleted nollataan implisiittisesti renderCvEditSection():lla, koska
 *     CV-data toimitetaan uudelleen.
 * @param {Object} app - EN: application record to edit / FI: muokattava hakemustietue
 */
// Function to open the modal and fill it with current data
function openEditAppModal(app) {
  const session = getCurrentSession();
  document.getElementById('editAppId').value = app.application_id;
  document.getElementById('editAppFirstName').value = currentProfile?.first_name || '';
  document.getElementById('editAppLastName').value = currentProfile?.last_name || '';
  document.getElementById('editAppEmail').value = app.email || session?.login || '';
  document.getElementById('editAppPhone').value = app.phone || currentProfile?.phone || '';
  document.getElementById('editAppLetter').value = app.cover_letter || '';

  renderCvEditSection(app.cv_original_name, app.cv_url);

  document.getElementById('editAppModal').style.display = 'block';
}

/**
 * EN: Renders the CV widget inside the application edit modal. Two states:
 *     - File exists: shows the filename with a remove (×) button.
 *     - No file: shows an upload prompt. Called both when the modal opens
 *       (with existing data) and after removal/selection to update the UI.
 *     "pending-upload" is used as a sentinel fileUrl value when handleEditCVSelection()
 *     has a file queued but not yet uploaded — it signals that a file is ready.
 * FI: Renderöi CV-widgetin hakemuksen muokkausmodaalissa. Kaksi tilaa:
 *     - Tiedosto olemassa: näyttää tiedostonimen poista (×) -painikkeella.
 *     - Ei tiedostoa: näyttää latauskehotteen. Kutsutaan sekä modaalin avautuessa
 *       (olemassa olevilla tiedoilla) että poistamisen/valinnan jälkeen käyttöliittymän päivittämiseksi.
 *     "pending-upload" käytetään sentinel-arvoona fileUrl-kentässä, kun
 *     handleEditCVSelection():ssa on tiedosto jonossa mutta ei vielä ladattu —
 *     se merkitsee, että tiedosto on valmis.
 * @param {string|null} fileName - EN: original filename or null / FI: alkuperäinen tiedostonimi tai null
 * @param {string|null} fileUrl - EN: public URL or null or "pending-upload" sentinel / FI: julkinen URL tai null tai "pending-upload" sentinel
 */
function renderCvEditSection(fileName, fileUrl) {
  const container = document.getElementById('editCvContainer');

  if (fileName && fileUrl) {
      // CASE: File exists - show name and 'X' button
      container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd;">
              <span style="font-size: 0.9rem; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">
                  ✅ ${fileName}
              </span>
              <button type="button" onclick="removeCvFromEdit()" style="background: #fee2e2; color: #ef4444; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-weight: bold;">✕</button>
          </div>
      `;
  } else {
      // CASE: No file - show upload button
      container.innerHTML = `
          <label for="editCvUpload" class="btn btn-secondary" style="width:100%; display:block; text-align:center; cursor:pointer; padding: 8px 0; background:#6366f1; color:white; border-radius:6px;">
              Upload CV (PDF)
          </label>
      `;
  }
}

/**
 * EN: Flag to track whether the user removed their CV in the current edit
 *     session. Needed because the file can only be removed after the modal's
 *     Save button is pressed — without this flag, updateApplication() would
 *     not know whether to null-out cv_url or leave it unchanged.
 * FI: Lippu sen seuraamiseen, onko käyttäjä poistanut CV:nsä nykyisessä
 *     muokkaussessiossa. Tarvitaan, koska tiedosto voidaan poistaa vasta
 *     modaalin Tallenna-painikkeen painamisen jälkeen — ilman tätä lippua
 *     updateApplication() ei tietäisi, pitäisikö cv_url nollata vai jättää
 *     muuttumattomaksi.
 */
// Variable to track if the user deleted their CV during this edit session
let isCvDeleted = false;

/**
 * EN: Asks for confirmation before removing the CV reference from the edit session.
 *     Sets isCvDeleted=true so updateApplication() knows to null-out the CV
 *     columns on save. Re-renders the CV section to show the upload prompt.
 * FI: Pyytää vahvistuksen ennen CV-viittauksen poistamista muokkaussessiosta.
 *     Asettaa isCvDeleted=true, jotta updateApplication() tietää nollata
 *     CV-sarakkeet tallennuksessa. Renderöi CV-osion uudelleen näyttääkseen
 *     latauskehotteen.
 */
async function removeCvFromEdit() {
    if(await showConfirm("Remove this CV? You will need to upload a new one before saving.", "Remove")) {
        isCvDeleted = true;
        // Reset the file input value
        document.getElementById('editCvUpload').value = "";
        // Re-render to show the upload button
        renderCvEditSection(null, null);
    }
}

/**
 * EN: Handles file selection in the edit modal's CV upload input. Updates the
 *     CV section to show the selected filename as a "pending" state. Clears
 *     isCvDeleted since the user is providing a replacement file.
 * FI: Käsittelee tiedoston valinnan muokkausmodaalin CV-lataussyötteessä.
 *     Päivittää CV-osion näyttämään valitun tiedostonimen "odottavana" tilana.
 *     Tyhjentää isCvDeleted:n, koska käyttäjä toimittaa korvaavan tiedoston.
 * @param {HTMLInputElement} input - EN: file input element after change event / FI: tiedostosyöttöelementti muutostapahtuman jälkeen
 */
function handleEditCVSelection(input) {
    if (input.files && input.files[0]) {
        isCvDeleted = false; // They uploaded a new one
        renderCvEditSection(input.files[0].name, "pending-upload");
    }
}

/**
 * EN: Saves changes to an existing application from the edit modal. Handles
 *     three CV scenarios in sequence:
 *       1. User deleted the CV (isCvDeleted=true): sets cv_url/cv_original_name to null.
 *       2. User selected a new file: uploads it to 'resumes' bucket and updates URL.
 *       3. No CV change: leaves CV fields unchanged (not included in updatedData).
 *     Reloads the full student profile after save to reflect the updated status.
 *     Resets isCvDeleted to false in the success path so the next modal open
 *     starts with a clean state.
 * FI: Tallentaa muutokset olemassa olevaan hakemukseen muokkausmodaalista.
 *     Käsittelee kolme CV-skenaariota järjestyksessä:
 *       1. Käyttäjä poisti CV:n (isCvDeleted=true): asettaa cv_url/cv_original_name:n nulliksi.
 *       2. Käyttäjä valitsi uuden tiedoston: lataa sen 'resumes'-ämpäriin ja päivittää URL:n.
 *       3. Ei CV-muutosta: jättää CV-kentät muuttumattomiksi (ei sisällytetty updatedData:han).
 *     Lataa koko opiskelijan profiilin uudelleen tallennuksen jälkeen päivitetyn tilan heijastamiseksi.
 *     Nollaa isCvDeleted:n false-arvoon onnistuneen polun yhteydessä, jotta seuraava
 *     modaalin avaus alkaa puhtaalla tilalla.
 */
// Function to save the updated data
async function updateApplication() {
  const appId = document.getElementById('editAppId').value;
  const saveBtn = document.querySelector('#editAppModal .btn-primary');

  const updatedData = {
      cover_letter: document.getElementById('editAppLetter').value,
      updated_at: new Date().toISOString()
  };

  // If user clicked 'X' and didn't upload a new one, set fields to null
  if (isCvDeleted) {
      updatedData.cv_url = null;
      updatedData.cv_original_name = null;
  }

  try {
      saveBtn.disabled = true;
      
      const cvInput = document.getElementById('editCvUpload');
      if (cvInput.files && cvInput.files[0]) {
          // ... (Same upload logic as before) ...
          const file = cvInput.files[0];
          const filePath = `resumes/${Date.now()}_${file.name}`;
          await supabaseClient.storage.from('resumes').upload(filePath, file);
          const { data: urlData } = supabaseClient.storage.from('resumes').getPublicUrl(filePath);
          
          updatedData.cv_url = urlData.publicUrl;
          updatedData.cv_original_name = file.name;
      }

      const { error } = await supabaseClient
          .from('applications')
          .update(updatedData)
          .eq('application_id', appId);

      if (error) throw error;

      showToast("Update successful!", 'success');
      isCvDeleted = false; // reset
      document.getElementById('editAppModal').style.display = 'none';
      loadStudentProfile();

  } catch (err) {
      showToast("Error: " + err.message, 'error');
  } finally {
      saveBtn.disabled = false;
  }
}

/**
 * EN: Navigates to the internship detail page for the given position ID so the
 *     student can review the full posting they applied to. Uses a direct
 *     location.href assignment rather than window.open so the back button works.
 * FI: Siirtyy harjoittelun yksityiskohtasivulle annetulle positio-ID:lle, jotta
 *     opiskelija voi tarkistaa koko ilmoituksen, johon he hakivat. Käyttää suoraa
 *     location.href-määritystä window.open:n sijaan, jotta taaksepäin-painike toimii.
 * @param {number} positionId - EN: positions.position_id to navigate to / FI: positions.position_id, johon siirrytään
 */
function viewApplication(positionId) {
  window.location.href = `internship-detail.html?id=${positionId}`;
}

/**
 * EN: Withdraws (deletes) a student's application after confirmation. Uses
 *     showConfirm() with "Withdraw" as the action label to make the destructive
 *     nature of the action clear in UX terms. Reloads the full student profile
 *     after deletion so the application card disappears from the list.
 * FI: Peruuttaa (poistaa) opiskelijan hakemuksen vahvistuksen jälkeen. Käyttää
 *     showConfirm():tä "Withdraw"-toimintotunnisteella ilmaistakseen selkeästi
 *     toiminnon tuhoavan luonteen UX:n näkökulmasta. Lataa koko opiskelijan
 *     profiilin uudelleen poistamisen jälkeen, jotta hakemuskortti katoaa listalta.
 * @param {number} applicationId - EN: applications.application_id to delete / FI: poistettava applications.application_id
 */
async function deleteApplication(applicationId) {
  if (!await showConfirm("Withdraw this application?", "Withdraw")) return;

  try {
      const { error } = await supabaseClient
          .from('applications')
          .delete()
          .eq('application_id', applicationId);

      if (error) throw error;
      showToast("Application withdrawn.", 'success');
      loadStudentProfile();
  } catch (err) {
      showToast("Delete failed: " + err.message, 'error');
  }
}
/**
 * EN: Provides real-time city name autocomplete using the Finnish Digitransit
 *     geocoding API. Only fires when at least 2 characters are typed to avoid
 *     flooding the API with single-char requests. The 'oa,osm' sources include
 *     OpenAddresses and OpenStreetMap data for comprehensive Finnish coverage.
 *     Deduplicates suggestions by locality name using a Set so the same city
 *     doesn't appear multiple times (e.g. when multiple streets match). Results
 *     are appended as <option> elements to a <datalist> linked to the city input.
 * FI: Tarjoaa reaaliaikaisen kaupungin nimen automaattisen täydentämisen käyttäen
 *     suomalaista Digitransit-geokoodaus-API:a. Käynnistyy vasta vähintään 2
 *     merkin kirjoittamisen jälkeen välttääkseen API:n tulvittamisen yhden
 *     merkin pyynnöillä. 'oa,osm'-lähteet sisältävät OpenAddresses- ja
 *     OpenStreetMap-datan kattavaa suomalaista kattavuutta varten.
 *     Deduplikoi ehdotukset paikkakuntanimen mukaan Set:llä, jotta sama kaupunki
 *     ei ilmesty useita kertoja (esim. kun useita katuja vastaa). Tulokset
 *     lisätään <option>-elementteinä kaupunkisyötteeseen linkitettyyn <datalist>:iin.
 * @param {string} query - EN: city name being typed / FI: kirjoitettava kaupungin nimi
 */
async function handleCityInput(query) {
  const datalist = document.getElementById('citySuggestions');
  const cleanQuery = query.trim();

  if (!cleanQuery || cleanQuery.length < 1) {
    if (datalist) datalist.innerHTML = '';
    return;
  }

  try {
    // Only request locality/localadmin layers — no address layer
    const url = `https://api.digitransit.fi/geocoding/v1/autocomplete?text=${encodeURIComponent(cleanQuery)}&layers=locality,localadmin&digitransit-subscription-key=${DIGITRANSIT_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (datalist) {
      datalist.innerHTML = '';

      if (data.features && data.features.length > 0) {
        const uniqueCities = new Set();

        data.features.forEach(feature => {
          const layer = feature.properties.layer;

          // Only process locality and localadmin layers (skip addresses)
          if (layer !== 'locality' && layer !== 'localadmin') return;

          const cityName = feature.properties.name;

          if (cityName && !uniqueCities.has(cityName)) {
            uniqueCities.add(cityName);
            const option = document.createElement('option');
            option.value = cityName;
            datalist.appendChild(option);
          }
        });
      }
    }
  } catch (err) {
    console.error("City Search Error:", err);
  }
}
/* ----------------------------------------------------------
   EDIT MODE — toggle between display and edit views
   Muokkaustila — vaihto näyttö- ja muokkausnäkymän välillä
   ---------------------------------------------------------- */

/**
 * EN: Switches the student profile page from display mode to edit mode.
 *     Pre-fills all form inputs from currentProfile and rebuilds the
 *     category dropdown and link rows for editing.
 * FI: Vaihtaa opiskelijan profiilisivun näyttötilasta muokkaustilaan.
 *     Täyttää kaikki lomakesyötteet currentProfile-objektista etukäteen
 *     ja rakentaa uudelleen kategorian pudotusvalikon ja linkkirivit muokkausta varten.
 */
// ==========================================
// EDIT MODE
// ==========================================
function enterEditMode() {
  if (!currentProfile) return;

  document.getElementById('displayMode').style.display = 'none';
  document.getElementById('editMode').style.display = 'block';
  document.getElementById('editProfileBtn').style.display = 'none';
  document.getElementById('saveProfileBtn').style.display = 'inline-block';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';

  // Fill form fields
  document.getElementById('eFirstName').value = currentProfile.first_name || '';
  document.getElementById('eLastName').value = currentProfile.last_name || '';
  document.getElementById('eBirthDate').value = currentProfile.birth_date || '';
  document.getElementById('ePhone').value = currentProfile.phone || '';
  document.getElementById('eCity').value = currentProfile.city || '';
  document.getElementById('eAbout').value = currentProfile.about || '';
  document.getElementById('eOpenToOffers').checked = currentProfile.is_open_to_offers;

  const container = document.getElementById('eEducationContainer');
  if (container) {
    container.innerHTML = ''; 
    if (currentProfile.education_history && currentProfile.education_history.length > 0) {
      currentProfile.education_history.forEach(edu => {
        addEducationRow(edu); 
      });
    } else {
      addEducationRow(); 
    }
  }
  // Render selected categories
  renderSelectedCategories();
  buildCategoryDropdown();

  // Render links
  fillEditLinks();
}

/**
 * EN: Returns the student profile page from edit mode to display mode without
 *     saving. Does not revert any UI state (form values, selected categories)
 *     since those are re-populated fresh when enterEditMode() is called again.
 *     Called by the Cancel button and by saveProfile() after a successful save.
 * FI: Palauttaa opiskelijan profiilisivun muokkaustilasta näyttötilaan tallentamatta.
 *     Ei palauta mitään UI-tilaa (lomaketunnukset, valitut kategoriat), koska ne
 *     täytetään uudelleen kun enterEditMode() kutsutaan seuraavan kerran.
 *     Kutsutaan Peruuta-painikkeella ja saveProfile():n toimesta onnistuneen
 *     tallennuksen jälkeen.
 */
function cancelEditMode() {
  document.getElementById('displayMode').style.display = 'block';
  document.getElementById('editMode').style.display = 'none';
  document.getElementById('editProfileBtn').style.display = 'inline-block';
  document.getElementById('saveProfileBtn').style.display = 'none';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

// This function opens and closes the edit boxes
/**
 * EN: Switches the company profile between display mode and edit mode.
 *     When entering edit mode (isEditing=true), it copies live DOM text into
 *     the corresponding input fields so the user sees their current data —
 *     not stale state from module variables. The header is dimmed to 50%
 *     opacity as a visual cue that the form is active. When exiting, all
 *     visibility is restored without touching the DB.
 * FI: Vaihtaa yrityksen profiilin näyttötilan ja muokkaustilan välillä.
 *     Muokkaustilaan siirryttäessä (isEditing=true) kopioi DOM-tekstin suoraan
 *     vastaaviin syöttökenttiin, jotta käyttäjä näkee nykyiset tietonsa —
 *     ei vanhentunutta tilaa moduulimuuttujista. Otsikko himmennetään 50%:n
 *     läpinäkyvyydelle visuaaliseksi merkiksi siitä, että lomake on aktiivinen.
 *     Poistuessa kaikki näkyvyys palautetaan ilman DB-kirjoitusta.
 * @param {boolean} isEditing - EN: true = enter edit mode, false = return to display / FI: true = siirry muokkaustilaan, false = palaa näyttötilaan
 */
function toggleCompanyEdit(isEditing) {
    const editBtn = document.getElementById('editCompanyBtn');
    const actionBtns = document.getElementById('editActionButtons');
    const displayAbout = document.getElementById('companyDisplayAbout');
    const editMode = document.getElementById('companyEditMode');
    const displayHeader = document.querySelector('.company-info');

    if (isEditing) {
        // 1. Copy current text INTO the input boxes so you can edit them
        document.getElementById('eCompanyName').value = document.getElementById('dCompanyName').innerText;
        document.getElementById('eCompanyEmail').value = currentProfile?.contact_email || getCurrentSession()?.login || '';
        document.getElementById('eCompanyDesc').value = document.getElementById('dCompanyDesc').innerText;
        document.getElementById('eHeadquarters').value = document.getElementById('dHeadquarters').innerText;
        document.getElementById('eTeamSize').value = document.getElementById('dTeamSize').innerText;
        document.getElementById('eWebsite').value = document.getElementById('dWebsite').innerText;

        // 2. Show the Edit form, hide the display text
        editBtn.style.display = 'none';
        actionBtns.style.display = 'flex';
        displayAbout.style.display = 'none';
        editMode.style.display = 'block';
        if(displayHeader) displayHeader.style.opacity = '0.5';
    } else {
        // 3. Switch back to normal view
        editBtn.style.display = 'inline-block';
        actionBtns.style.display = 'none';
        displayAbout.style.display = 'block';
        editMode.style.display = 'none';
        if(displayHeader) displayHeader.style.opacity = '1';
    }
}


/**
 * EN: Saves the student profile after edit mode. Performs three Supabase writes
 *     sequentially (not parallel) because each depends on the profile existing:
 *       1. Update student_profiles row.
 *       2. Delete + re-insert student_categories (simplest consistency strategy).
 *       3. Save links (delete + re-insert via saveLinks()).
 *     On success, updates currentProfile in-place and switches back to display mode.
 * FI: Tallentaa opiskelijan profiilin muokkaustilan jälkeen. Suorittaa kolme
 *     Supabase-kirjoitusta peräkkäin (ei rinnakkain), koska jokainen riippuu
 *     profiilin olemassaolosta:
 *       1. Päivitetään student_profiles-rivi.
 *       2. Poistetaan + lisätään uudelleen student_categories (yksinkertaisin johdonmukaisuusstrategia).
 *       3. Tallennetaan linkit (poisto + uudelleenlisäys saveLinks()-kautta).
 *     Onnistuessaan päivittää currentProfile-objektin paikallaan ja siirtyy takaisin näyttötilaan.
 */
// ==========================================
// SAVE PROFILE
// ==========================================
async function saveProfile() {
  const saveBtn = document.getElementById('saveProfileBtn');
  const session = getCurrentSession();
  if (!session || !currentProfile) return;

  
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {

    const educationEntries = getEducationData();

    const updates = {
      first_name: document.getElementById('eFirstName').value.trim() || null,
      last_name: document.getElementById('eLastName').value.trim() || null,
      birth_date: document.getElementById('eBirthDate').value || null,
      phone: document.getElementById('ePhone').value.trim() || null,
      city: document.getElementById('eCity').value.trim() || null,
      education_history: educationEntries,
      type_education: educationEntries.length > 0 ? educationEntries[0].name : null,
      about: document.getElementById('eAbout').value.trim() || null,
      is_open_to_offers: document.getElementById('eOpenToOffers').checked,
      updated_at: new Date().toISOString()
    };

    // Update profile
    const { error: updateError } = await supabaseClient
      .from('student_profiles')
      .update(updates)
      .eq('id', currentProfile.id);

    if (updateError) {
      throw new Error('Error saving profile: ' + updateError.message);
    }

    // Update categories: delete old, insert new
    const { error: categoryDeleteError } = await supabaseClient
      .from('student_categories')
      .delete()
      .eq('student_id', currentProfile.id);

    if (categoryDeleteError) throw new Error('Category cleanup failed: ' + categoryDeleteError.message);

    // 2. Save Categories (Optional/Safety check)
    if (typeof selectedCategoryIds !== 'undefined') {
        if (selectedCategoryIds.length > 0) {
            const catRows = selectedCategoryIds.map(catId => ({ student_id: currentProfile.id, category_id: catId }));
            const { error: categoryInsertError } = await supabaseClient.from('student_categories').insert(catRows);
            if (categoryInsertError) throw new Error('Category insert failed: ' + categoryInsertError.message);
        }
    }

    // 3. Save links
    await saveLinks();

    // 4. UPDATE LOCAL STATE AND REFRESH UI
    Object.assign(currentProfile, updates);

    fillDisplayMode(currentProfile, session);
    updateEducationDisplay(educationEntries);
    cancelEditMode();
    showToast('Profile saved successfully!', 'success');

  } catch (err) {
    console.error('Save error:', err);
    showToast(err.message || 'An error occurred while saving.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}
// ==========================================
// CATEGORY SEARCH & SELECTION
// ==========================================

/**
 * EN: Renders the full category dropdown from the module-level allCategories array.
 *     Categories are grouped by their job_groups.title so the list is organised
 *     into labelled sections. Each option gets the 'selected' CSS class if its
 *     category_id is already in selectedCategoryIds, providing persistent visual
 *     state across open/close cycles without a re-query.
 * FI: Renderöi täyden kategoriavalikkolistauksen moduulitason allCategories-taulukosta.
 *     Kategoriat ryhmitellään job_groups.title-kentän mukaan, jotta lista on
 *     järjestetty nimettyihin osioihin. Jokainen vaihtoehto saa 'selected'-CSS-luokan,
 *     jos sen category_id on jo selectedCategoryIds-taulukossa, tarjoten pysyvän
 *     visuaalisen tilan avaus/sulkemissyklien välillä ilman uudelleenkyselyä.
 */
function buildCategoryDropdown() {
  const dropdown = document.getElementById('categoryDropdown');
  if (!dropdown) return;

  // Group categories by job_group
  const groups = {};
  allCategories.forEach(cat => {
    const groupTitle = cat.job_groups?.title || 'Other';
    if (!groups[groupTitle]) groups[groupTitle] = [];
    groups[groupTitle].push(cat);
  });

  let html = '';
  for (const [groupTitle, cats] of Object.entries(groups)) {
    html += `<div class="category-group-title">${groupTitle}</div>`;
    cats.forEach(cat => {
      const isSelected = selectedCategoryIds.includes(cat.category_id);
      html += `<div class="category-option ${isSelected ? 'selected' : ''}"
                    data-id="${cat.category_id}"
                    onclick="toggleCategory(${cat.category_id})">
                ${cat.title}
              </div>`;
    });
  }

  dropdown.innerHTML = html;
}

/**
 * EN: Filters the visible category options in-place by the current search input
 *     text. Works on existing rendered DOM elements (not a re-render) for speed.
 *     Group title headers are hidden unless at least one option in that group
 *     matches, keeping the layout clean when groups have no results. Walks
 *     backwards through siblings to find the owning group title element.
 * FI: Suodattaa näkyvät kategoriavaihtoehdot paikanpäällä nykyisen hakusyötteen mukaan.
 *     Toimii olemassa olevissa renderöidyissä DOM-elementeissä (ei uudelleenrenderöintiä)
 *     nopeuden vuoksi. Ryhmäotsikot piilotetaan, ellei vähintään yksi vaihtoehto
 *     kyseisessä ryhmässä vastaa hakua, pitäen asettelun siistinä kun ryhmissä
 *     ei ole tuloksia. Kävelee taaksepäin sisarelementtien läpi löytääkseen
 *     omistavan ryhmäotsikon elementin.
 */
function filterCategories() {
  const search = document.getElementById('categorySearchInput').value.toLowerCase();
  const dropdown = document.getElementById('categoryDropdown');
  dropdown.classList.add('show');

  const options = dropdown.querySelectorAll('.category-option');
  const groupTitles = dropdown.querySelectorAll('.category-group-title');

  // Hide all group titles first
  groupTitles.forEach(g => g.style.display = 'none');

  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    if (text.includes(search)) {
      opt.style.display = '';
      // Show parent group title
      let prev = opt.previousElementSibling;
      while (prev && !prev.classList.contains('category-group-title')) {
        prev = prev.previousElementSibling;
      }
      if (prev) prev.style.display = '';
    } else {
      opt.style.display = 'none';
    }
  });
}

/**
 * EN: Opens the category dropdown and resets all items to visible. Called when
 *     the user focuses the category search input without having typed anything.
 *     Explicitly un-hides every option and group title in case a prior
 *     filterCategories() call hid some of them — avoids a full re-render.
 * FI: Avaa kategoriavalikkolistauksen ja palauttaa kaikki kohteet näkyviksi.
 *     Kutsutaan kun käyttäjä tarkentaa kategoriahakusyötteeseen ilman kirjoittamista.
 *     Poistaa nimenomaisesti piilotuksen kaikista vaihtoehdoista ja ryhmäotsikoista,
 *     jos edellinen filterCategories()-kutsu piilotti joitakin — välttää täyden
 *     uudelleenrenderöinnin.
 */
function showCategoryDropdown() {
  const dropdown = document.getElementById('categoryDropdown');
  if (dropdown) {
    dropdown.classList.add('show');
    // Show all when opening
    dropdown.querySelectorAll('.category-option, .category-group-title').forEach(el => {
      el.style.display = '';
    });
  }
}

/**
 * EN: Toggles a category in/out of selectedCategoryIds when the user clicks an
 *     option in the dropdown. After mutation, re-renders the selected-tags row
 *     and rebuilds the dropdown so the 'selected' highlight class updates.
 *     In-place splice/push avoids creating a new array reference, preserving
 *     any closures that hold a reference to selectedCategoryIds.
 * FI: Lisää/poistaa kategorian selectedCategoryIds-taulukosta, kun käyttäjä
 *     klikkaa vaihtoehtoa valikkolistauksessa. Mutaation jälkeen uudelleenrenderöi
 *     valittujen tunnisteiden rivin ja rakentaa valikkolistauksen uudelleen,
 *     jotta 'selected'-korostusluokka päivittyy. Paikanpäällä tapahtuva
 *     splice/push välttää uuden taulukkoviittauksen luomista, säilyttäen
 *     mahdolliset sulkeumat, joilla on viittaus selectedCategoryIds-taulukkoon.
 * @param {number} categoryId - EN: category_id to toggle / FI: category_id, joka lisätään tai poistetaan
 */
function toggleCategory(categoryId) {
  const idx = selectedCategoryIds.indexOf(categoryId);
  if (idx === -1) {
    selectedCategoryIds.push(categoryId);
  } else {
    selectedCategoryIds.splice(idx, 1);
  }
  renderSelectedCategories();
  buildCategoryDropdown();
}

/**
 * EN: Removes a category from selectedCategoryIds by creating a new filtered
 *     array (unlike toggleCategory which mutates in place). Called by the ×
 *     button on each selected tag chip, so reassignment is intentional here —
 *     the tag's onclick already captured the ID, no dropdown interaction needed.
 * FI: Poistaa kategorian selectedCategoryIds-taulukosta luomalla uuden suodatetun
 *     taulukon (toisin kuin toggleCategory, joka mutoi paikanpäällä). Kutsutaan
 *     ×-painikkeella jokaisesta valitun tunnisteen napista, joten uudelleenmääritys
 *     on tarkoituksellinen tässä — napin onclick on jo siepannut ID:n, dropdown-
 *     vuorovaikutusta ei tarvita.
 * @param {number} categoryId - EN: category_id to remove / FI: poistettava category_id
 */
function removeCategory(categoryId) {
  selectedCategoryIds = selectedCategoryIds.filter(id => id !== categoryId);
  renderSelectedCategories();
  buildCategoryDropdown();
}

/**
 * EN: Renders the selected-category tag chips in the edit form. Uses allCategories
 *     (already in memory) to look up titles by ID, avoiding an extra DB query.
 *     Returns empty string for any ID not found (defensive against stale state).
 *     Each chip has an inline × button that calls removeCategory so removal
 *     stays snappy without a server round-trip.
 * FI: Renderöi valittujen kategorioiden tunnistenapit muokkauslomakkeeseen.
 *     Käyttää allCategories-taulukkoa (jo muistissa) otsikoiden hakuun ID:n mukaan,
 *     välttäen ylimääräisen DB-kyselyn. Palauttaa tyhjän merkkijonon kaikille
 *     ID:ille, joita ei löydy (puolustautuu vanhentunutta tilaa vastaan).
 *     Jokaisella napilla on inline-×-painike, joka kutsuu removeCategory-funktiota,
 *     jotta poisto pysyy nopeana ilman palvelinkierrosta.
 */
function renderSelectedCategories() {
  const container = document.getElementById('eSelectedCategories');
  if (!container) return;

  if (selectedCategoryIds.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = selectedCategoryIds.map(id => {
    const cat = allCategories.find(c => c.category_id === id);
    if (!cat) return '';
    return `<span class="category-tag">
              ${cat.title}
              <button onclick="removeCategory(${id})">&times;</button>
            </span>`;
  }).join('');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const search = document.querySelector('.category-search');
  const dropdown = document.getElementById('categoryDropdown');
  if (dropdown && search && !search.contains(e.target)) {
    dropdown.classList.remove('show');
  }

  const reqSearch = document.getElementById('reqCategorySearch');
  const reqDropdown = document.getElementById('reqCategoryDropdown');
  if (reqDropdown && reqSearch && !reqSearch.contains(e.target) && !reqDropdown.contains(e.target)) {
    reqDropdown.classList.remove('show');
  }

  const posSearch = document.getElementById('pCategorySearch');
  const posDropdown = document.getElementById('posCategoryDropdown');
  if (posDropdown && posSearch && !posSearch.contains(e.target) && !posDropdown.contains(e.target)) {
    posDropdown.classList.remove('show');
  }
});

// ==========================================
// LINKS (Student_links table)
// ==========================================

/**
 * EN: Unicode icon map for the four supported link types.
 *     Kept as a constant so all link-rendering functions share one source of truth.
 *     Numeric HTML entities are used instead of emoji literals to avoid encoding
 *     issues in files saved with non-UTF-8 editors.
 * FI: Unicode-kuvaketaulukko neljälle tuetulle linkityypille.
 *     Pidetään vakiona, jotta kaikki linkkien renderöintifunktiot jakavat
 *     yhden totuuden lähteen. Numeerisia HTML-entiteettejä käytetään
 *     emoji-literaalien sijaan, jotta vältetään koodausongelmat
 *     ei-UTF-8-editoreilla tallennetuissa tiedostoissa.
 */
const LINK_ICONS = {
  github: '&#128736;',
  linkedin: '&#128100;',
  portfolio: '&#127760;',
  other: '&#128279;'
};

/**
 * EN: Renders the read-only links list in the student profile display panel.
 *     Falls back to a labelled empty-state message when no links are saved.
 *     Uses rel="noopener" on external links to prevent the opened tab from
 *     gaining a reference to the parent window via window.opener.
 * FI: Renderöi vain-luku-linkkilistaukseen opiskelijan profiilin näyttöpaneelissa.
 *     Palaa nimettyyn tyhjän tilan viestiin, kun linkkejä ei ole tallennettu.
 *     Käyttää rel="noopener" ulkoisissa linkeissä estääkseen avatun välilehden
 *     saamasta viittausta pääikkunaan window.opener-kautta.
 */
function fillLinks() {
  const container = document.getElementById('dLinks');
  if (!container) return;

  if (currentLinks.length === 0) {
    container.innerHTML = '<span class="profile-field-value empty">No links added</span>';
    return;
  }

  container.innerHTML = currentLinks.map(link => {
    const icon = LINK_ICONS[link.link_type] || LINK_ICONS.other;
    const label = link.label || link.link_type;
    return `<div class="link-item">
              <span class="link-icon">${icon}</span>
              <a href="${link.url}" target="_blank" rel="noopener">${label}</a>
            </div>`;
  }).join('');
}

/**
 * EN: Populates the edit-mode links form from the currentLinks module variable.
 *     Clears the container first so switching to edit mode doesn't double-render.
 *     Delegates each row to addLinkRowHtml so the DOM structure is consistent
 *     between loaded links and newly added empty rows.
 * FI: Täyttää muokkaustilan linkkilomakkeen currentLinks-moduulimuuttujasta.
 *     Tyhjentää säiliön ensin, jotta muokkaustilaan siirtyminen ei renderöi
 *     kahteen kertaan. Delegoi jokaisen rivin addLinkRowHtml-funktiolle, jotta
 *     DOM-rakenne on yhtenäinen ladattujen linkkien ja uusien tyhjien rivien välillä.
 */
function fillEditLinks() {
  const container = document.getElementById('eLinksContainer');
  if (!container) return;

  container.innerHTML = '';
  currentLinks.forEach((link, index) => {
    addLinkRowHtml(container, link.link_type, link.label || '', link.url, link.link_id);
  });
}

/**
 * EN: Adds a blank link row to the edit-mode links container when the user
 *     clicks "Add Link". Defaults the type to 'github' as the most common
 *     link type for student profiles. linkId is null because this row has
 *     no existing DB record yet — saveLinks() will INSERT it on save.
 * FI: Lisää tyhjän linkkirivi muokkaustilan linkkisäiliöön, kun käyttäjä
 *     klikkaa "Lisää linkki". Oletustyyppinä on 'github', koska se on yleisin
 *     linkityyppi opiskelijaprofiileissa. linkId on null, koska tällä rivillä
 *     ei ole vielä olemassa olevaa DB-tietuetta — saveLinks() lisää sen tallennuksessa.
 */
function addLinkRow() {
  const container = document.getElementById('eLinksContainer');
  if (!container) return;
  addLinkRowHtml(container, 'github', '', '', null);
}

/**
 * EN: Creates and appends a single editable link row DOM element to the container.
 *     Used for both loading existing links and inserting new blank rows. Stores
 *     linkId in data-link-id so saveLinks() can distinguish updates from inserts;
 *     an empty string signals a new row. The ×-button removes the row entirely
 *     without touching the DB — saveLinks() handles the delete on save by
 *     using a full delete+re-insert pattern rather than tracking individual changes.
 * FI: Luo ja lisää yksittäisen muokattavan linkkirivin DOM-elementin säiliöön.
 *     Käytetään sekä olemassa olevien linkkien lataamiseen että uusien tyhjien
 *     rivien lisäämiseen. Tallentaa linkId:n data-link-id-attribuuttiin, jotta
 *     saveLinks() voi erottaa päivitykset lisäyksistä; tyhjä merkkijono merkitsee
 *     uuden rivin. ×-painike poistaa rivin kokonaan ilman DB-kosketusta —
 *     saveLinks() käsittelee poiston tallennuksessa käyttämällä täyttä
 *     poista+uudelleenlisää-mallia yksilöllisten muutosten seuraamisen sijaan.
 * @param {HTMLElement} container - EN: parent element to append the row to / FI: vanhempaelementti, johon rivi lisätään
 * @param {string} type - EN: link type key (github/linkedin/portfolio/other) / FI: linkityypin avain
 * @param {string} label - EN: display label for the link / FI: linkin näyttöteksti
 * @param {string} url - EN: full URL / FI: täydellinen URL
 * @param {string|null} linkId - EN: existing DB row ID, or null for new row / FI: olemassa oleva DB-rivin ID tai null uudelle riville
 */
function addLinkRowHtml(container, type, label, url, linkId) {
  const row = document.createElement('div');
  row.className = 'link-edit-row';
  row.dataset.linkId = linkId || '';
  row.innerHTML = `
    <select class="link-type-select">
      <option value="github" ${type === 'github' ? 'selected' : ''}>GitHub</option>
      <option value="linkedin" ${type === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
      <option value="portfolio" ${type === 'portfolio' ? 'selected' : ''}>Portfolio</option>
      <option value="other" ${type === 'other' ? 'selected' : ''}>Other</option>
    </select>
    <input type="text" class="link-label-input" placeholder="Label" value="${label}" />
    <input type="url" class="link-url-input" placeholder="https://..." value="${url}" />
    <button type="button" class="link-remove-btn" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(row);
}

/**
 * EN: Persists the current link edit form to Supabase using a delete+re-insert
 *     pattern. All existing links for the student are deleted first, then the
 *     form rows with a non-empty URL are inserted as new records. This avoids
 *     complex diff logic (which rows changed, which are new, which were removed)
 *     at the cost of one extra delete round-trip. After save, reloads links from
 *     DB into currentLinks and refreshes the display panel.
 * FI: Tallentaa nykyisen linkkimuokkauslomakkeen Supabaseen käyttämällä
 *     poista+uudelleenlisää-mallia. Kaikki opiskelijan olemassa olevat linkit
 *     poistetaan ensin, sitten lomakerivit, joilla on ei-tyhjä URL, lisätään
 *     uusina tietueina. Tämä välttää monimutkaisen diff-logiikan (mitkä rivit
 *     muuttuivat, mitkä ovat uusia, mitkä poistettiin) yhden ylimääräisen
 *     poistokierroksen kustannuksella. Tallennuksen jälkeen lataa linkit uudelleen
 *     DB:stä currentLinks-muuttujaan ja päivittää näyttöpaneelin.
 */
async function saveLinks() {
  if (!currentProfile) return;

  const container = document.getElementById('eLinksContainer');
  if (!container) return;

  const rows = container.querySelectorAll('.link-edit-row');
  const newLinks = [];

  rows.forEach(row => {
    const url = row.querySelector('.link-url-input').value.trim();
    if (!url) return; // skip empty
    newLinks.push({
      student_id: currentProfile.id,
      link_type: row.querySelector('.link-type-select').value,
      label: row.querySelector('.link-label-input').value.trim() || null,
      url: url
    });
  });

  // Delete old links
  await supabaseClient
    .from('Student_links')
    .delete()
    .eq('student_id', currentProfile.id);

  // Insert new
  if (newLinks.length > 0) {
    const { error } = await supabaseClient
      .from('Student_links')
      .insert(newLinks);

    if (error) {
      console.error('Error saving links:', error);
      return;
    }
  }

  // Reload links
  const { data } = await supabaseClient
    .from('Student_links')
    .select('*')
    .eq('student_id', currentProfile.id)
    .order('created_at');

  currentLinks = data || [];
  fillLinks();
}

// ==========================================
// AVATAR (Supabase Storage: foto)
// ==========================================

/**
 * EN: Updates the avatar <img> and placeholder elements based on whether
 *     the profile has a photo_url. The placeholder (typically initials or
 *     a default icon) is shown when there is no URL, and the <img> is hidden,
 *     preventing a broken-image icon from flashing while the URL is absent.
 * FI: Päivittää avatar-<img>- ja paikkamerkki-elementit sen mukaan, onko
 *     profiililla photo_url. Paikkamerkki (yleensä nimikirjaimet tai
 *     oletusokulake) näytetään, kun URL puuttuu, ja <img> piilotetaan,
 *     estäen rikkinäisen kuvan kuvakkeen vilkkuminen URL:n puuttuessa.
 * @param {Object} profile - EN: profile object with optional photo_url / FI: profiiliobjekti valinnaisella photo_url-kentällä
 */
function fillAvatar(profile) {
  const img = document.getElementById('avatarImg');
  const placeholder = document.getElementById('avatarPlaceholder');
  if (!img || !placeholder) return;

  if (profile.photo_url) {
    img.src = profile.photo_url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = '';
  }
}

/**
 * EN: Uploads a student's profile photo to the 'foto' Supabase Storage bucket
 *     and saves the resulting public URL to student_profiles.photo_url.
 *     Uses a deterministic filename (user_{id}/avatar.{ext}) with upsert:true
 *     so repeated uploads overwrite the same path rather than creating new files.
 *     After upload, updates currentProfile in memory and re-renders fillAvatar()
 *     so the new photo appears instantly without a page reload.
 * FI: Lataa opiskelijan profiilikuvan 'foto'-Supabase-tallennussäilöön ja tallentaa
 *     tuloksena olevan julkisen URL:n student_profiles.photo_url-kenttään.
 *     Käyttää deterministä tiedostonimeä (user_{id}/avatar.{ext}) upsert:true-asetuksella,
 *     jotta toistuvat lataukset ylikirjoittavat saman polun uusien tiedostojen
 *     luomisen sijaan. Latauksen jälkeen päivittää currentProfile-muuttujan muistissa
 *     ja renderöi fillAvatar() uudelleen, jotta uusi kuva näkyy välittömästi
 *     ilman sivun uudelleenlatausta.
 * @param {HTMLInputElement} input - EN: file input element after change event / FI: tiedostosyöttöelementti muutostapahtuman jälkeen
 */
async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file || !currentProfile) return;

  const session = getCurrentSession();
  if (!session) return;

  // Max 2MB
  if (file.size > 2 * 1024 * 1024) {
    showToast('Photo must be under 2 MB.', 'warning');
    return;
  }

  const ext = file.name.split('.').pop();
  const filePath = `user_${session.userId}/avatar.${ext}`;

  try {
    // Upload to Supabase Storage (overwrite if exists)
    const { error: uploadError } = await supabaseClient.storage
      .from('foto')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      showToast('Upload error: ' + uploadError.message, 'error');
      return;
    }

    // Get public URL
    const { data } = supabaseClient.storage
      .from('foto')
      .getPublicUrl(filePath);

    const photoUrl = data.publicUrl;

    // Save URL to profile
    await supabaseClient
      .from('student_profiles')
      .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
      .eq('id', currentProfile.id);

    currentProfile.photo_url = photoUrl;
    fillAvatar(currentProfile);
  } catch (err) {
    console.error('Avatar upload error:', err);
    showToast('Failed to upload photo.', 'error');
  }
}

/**
 * EN: Uploads a company logo to the 'foto' bucket and saves the public URL to
 *     the Companies table. Uses a cache-busting timestamp query string (?t=...)
 *     appended to the URL before saving to DB so the browser fetches the new
 *     image immediately rather than serving the old one from its HTTP cache.
 *     Falls back to manually updating #avatarImg if fillCompanyLogo() is not
 *     yet defined (defensive programming for load-order edge cases).
 * FI: Lataa yrityksen logon 'foto'-säilöön ja tallentaa julkisen URL:n
 *     Companies-taulukkoon. Käyttää välimuistin ohittavaa aikaleimakysely-
 *     merkkijonoa (?t=...) URL:ään liitettynä ennen DB:hen tallentamista,
 *     jotta selain hakee uuden kuvan välittömästi palvelematta vanhaa HTTP-
 *     välimuististaan. Palautuu manuaaliseen #avatarImg-päivitykseen, jos
 *     fillCompanyLogo() ei ole vielä määritelty (puolustava ohjelmointi
 *     latausjärjestyksen reunatapauksille).
 * @param {HTMLInputElement} input - EN: file input element after change event / FI: tiedostosyöttöelementti muutostapahtuman jälkeen
 */
async function uploadLogo(input) {
  const file = input.files[0];

  // 1. Basic checks (Must have file and profile loaded)
  if (!file || !currentProfile) return;

  // 2. Check Session (Must be logged in)
  const session = getCurrentSession();
  if (!session) {
    showToast("Please log in to upload a logo.", 'warning');
    return;
  }

  // 3. Size Validation (Max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('Logo must be under 2 MB.', 'warning');
    return;
  }

  const ext = file.name.split('.').pop();
  // Using company_id to keep folder organized
  const filePath = `company_${currentProfile.company_id}/logo.${ext}`;

  try {
    // 4. Upload to 'fotot' bucket (upsert: true overwrites existing file)
    const { error: uploadError } = await supabaseClient.storage
      .from('foto')
      .upload(filePath, file, { 
          upsert: true,
          cacheControl: '3600' 
      });

    if (uploadError) {
      showToast('Upload error: ' + uploadError.message, 'error');
      return;
    }

    // 5. Get Public URL
    const { data: urlData } = supabaseClient.storage
      .from('foto')
      .getPublicUrl(filePath);

    const logoUrl = urlData.publicUrl;

    // 6. Save URL to 'Companies' table
    // Adding a timestamp to the URL (logoUrl?t=...) trick the browser into 
    // showing the new image immediately instead of the old cached one
    const finalUrl = `${logoUrl}?t=${new Date().getTime()}`;

    const { error: updateError } = await supabaseClient
      .from('Companies')
      .update({ 
          logo_url: finalUrl, 
          updated_at: new Date().toISOString() 
      })
      .eq('company_id', currentProfile.company_id);

    if (updateError) throw updateError;

    currentProfile.logo_url = finalUrl;
    
    // Ensure this matches your UI update function name
    if (typeof fillCompanyLogo === 'function') {
        fillCompanyLogo(currentProfile);
    } else {
        // Fallback: manually update the elements
        const logoImg = document.getElementById('avatarImg');
        const placeholder = document.getElementById('avatarPlaceholder');
        if (logoImg) {
            logoImg.src = finalUrl;
            logoImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    }

    showToast('Logo updated successfully!', 'success');

  } catch (err) {
    console.error('Logo upload error:', err);
    showToast('Failed to upload logo.', 'error');
  }
}
// ==========================================
// CV FILE (Supabase Storage: practice-files)
// ==========================================

/**
 * EN: Uploads a CV/resume file to the 'practice-files' Supabase Storage bucket.
 *     Sanitizes the filename (non-alphanumeric chars replaced with _) to prevent
 *     path traversal and URL encoding issues. Prefixes with Date.now() to make
 *     filenames unique and avoid collisions when the student uploads a new CV
 *     with the same original name. Saves only the public URL and original filename
 *     to student_profiles (not the file content) so the row stays lightweight.
 *     On error, still calls renderCVList() so the UI reflects any previous state.
 * FI: Lataa CV/ansioluettelo-tiedoston 'practice-files'-Supabase-tallennussäilöön.
 *     Puhdistaa tiedostonimen (ei-aakkosnumeeriset merkit korvataan _:llä) polun
 *     läpikäymis- ja URL-koodausongelmien estämiseksi. Lisää etuliitteeksi
 *     Date.now()-arvon tiedostonimien ainutlaatuisuuden varmistamiseksi ja
 *     törmäysten välttämiseksi, kun opiskelija lataa uuden CV:n samalla
 *     alkuperäisellä nimellä. Tallentaa vain julkisen URL:n ja alkuperäisen
 *     tiedostonimen student_profiles-taulukkoon (ei tiedoston sisältöä),
 *     jotta rivi pysyy kevyenä. Virhetilanteessa kutsuu silti renderCVList():tä,
 *     jotta käyttöliittymä heijastaa mahdollista aiempaa tilaa.
 * @param {HTMLInputElement} input - EN: file input after change event / FI: tiedostosyöttö muutostapahtuman jälkeen
 */
// 1. THE UPLOAD FUNCTION
async function uploadCV(input) {
  const file = input.files[0];
  if (!file || !currentProfile) return;

  const BUCKET_NAME = 'practice-files'; 
  
  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const filePath = `user_${currentProfile.id}/${Date.now()}_${safeName}`;

  try {
    const infoDiv = document.getElementById('cvFileInfo');
    if (infoDiv) infoDiv.innerHTML = '<p class="text-muted">Uploading...</p>';


    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const { error: dbError } = await supabaseClient
      .from('student_profiles')
      .update({ 
        cv_url: urlData.publicUrl,
        cv_original_name: file.name
      })
      .eq('id', currentProfile.id);

    if (dbError) throw dbError;


    currentProfile.cv_url = urlData.publicUrl;
    currentProfile.cv_original_name = file.name;

    renderCVList(); 
    showToast('CV uploaded successfully!', 'success');

  } catch (err) {
    console.error('Upload Error:', err);
    showToast('Note: ' + err.message, 'info');
    renderCVList(); 
  }
}

/**
 * EN: Removes the student's CV reference from the DB (sets cv_url and
 *     cv_original_name to null). Note: this does NOT delete the file from
 *     Supabase Storage — the file path remains in the bucket. Storage cleanup
 *     only happens during full account deletion (confirmDeleteAccount). Uses
 *     showConfirm() to require explicit user confirmation before destructive action.
 * FI: Poistaa opiskelijan CV-viittauksen DB:stä (asettaa cv_url:n ja
 *     cv_original_name:n nulliksi). Huomio: tämä EI poista tiedostoa Supabase
 *     Storage -säilöstä — tiedostopolku jää ämpäriin. Tallennuksen siivous
 *     tapahtuu vain täydellisen tilin poistamisen yhteydessä (confirmDeleteAccount).
 *     Käyttää showConfirm():tä vaatiakseen käyttäjältä nimenomaisen vahvistuksen
 *     ennen tuhoavaa toimintoa.
 */
// 3. THE DELETE FUNCTION
async function deleteCV() {
  if (!await showConfirm("Are you sure you want to remove this CV?", "Remove")) return;

  try {
    const { error } = await supabaseClient
      .from('student_profiles')
      .update({ 
        cv_url: null, 
        cv_original_name: null 
      })
      .eq('id', currentProfile.id);

    if (error) throw error;

    currentProfile.cv_url = null;
    currentProfile.cv_original_name = null;
    
    renderCVList();
    showToast("CV removed from profile.", 'success');
    
  } catch (err) {
    console.error("Delete error:", err);
    showToast("Failed to delete: " + err.message, 'error');
  }
}

/**
 * EN: Compatibility alias for renderCVList(). Exists so HTML onclick attributes
 *     and older code that called fillCvInfo() continue to work without refactoring.
 * FI: Yhteensopivuusaliase renderCVList()-funktiolle. Olemassa, jotta HTML-
 *     onclick-attribuutit ja vanhempi koodi, joka kutsui fillCvInfo():tä,
 *     toimivat edelleen ilman uudelleenmuotoilua.
 */
// 4. ALIAS FOR COMPATIBILITY
function fillCvInfo() {
    renderCVList();
}

/**
 * EN: Compatibility alias for renderCompanyCvList(). Mirrors fillCvInfo() for
 *     the company-side document widget.
 * FI: Yhteensopivuusaliase renderCompanyCvList()-funktiolle. Peilaa fillCvInfo():tä
 *     yrityksen asiakirjawidgetille.
 */
function fillCompanyCvInfo() {
    renderCompanyCvList();
}

/**
 * EN: Renders the student's CV download/delete widget in #cvFileInfo.
 *     Shows the original filename (stored separately in cv_original_name) rather
 *     than the storage path, which contains a sanitized + timestamped version.
 *     Falls back to 'Resume.pdf' if cv_original_name was not saved (older records).
 * FI: Renderöi opiskelijan CV-lataus/poisto-widgetin #cvFileInfo-elementtiin.
 *     Näyttää alkuperäisen tiedostonimen (tallennettu erikseen cv_original_name-kenttään)
 *     tallennuspolun sijaan, joka sisältää puhdistetun + aikaleimatun version.
 *     Palaa 'Resume.pdf':ään, jos cv_original_name:ä ei tallennettu (vanhemmat tietueet).
 */
function renderCVList() {
  const container = document.getElementById('cvFileInfo');
  if (!container || !currentProfile || !currentProfile.cv_url) {
    if (container) container.innerHTML = '<p class="text-muted">No CV uploaded yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <span style="font-size: 1.4rem;">📄</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.95rem; font-weight: 600; color: #1f2937; word-break: break-all; line-height: 1.3;">
            ${currentProfile.cv_original_name || 'Resume.pdf'}
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-view" onclick="downloadCVFile('${currentProfile.cv_url}', '${currentProfile.cv_original_name || 'cv.pdf'}')"
           style="flex: 1; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 500;">
           Download
        </button>
        <button class="btn-delete" onclick="deleteCV()" 
           style=" border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 500;">
           Delete
        </button>
      </div>
    </div>
  `;
}


/**
 * EN: Renders the company profile document download widget in #companyCvFileInfo.
 *     Company-side documents are read-only from the profile page (no delete button),
 *     so only a Download button is shown. Provides a friendly display name label
 *     above the filename to help users identify the widget purpose at a glance.
 * FI: Renderöi yrityksen profiiliasiakirjan latauswidgetin #companyCvFileInfo-elementtiin.
 *     Yrityksen puolen asiakirjat ovat vain-luku profiilisivulta (ei poistopainiketta),
 *     joten vain Lataa-painike näytetään. Tarjoaa ystävällisen näyttönimiotsikon
 *     tiedostonimen yläpuolella auttamaan käyttäjiä tunnistamaan widgetin tarkoituksen
 *     yhdellä silmäyksellä.
 */
function renderCompanyCvList() {
  const container = document.getElementById('companyCvFileInfo');
  if (!container || !currentProfile || !currentProfile.company_cv_url) {
    if (container) container.innerHTML = '<p class="text-muted">No document uploaded yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="background: white; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <span style="font-size: 1.4rem;">📄</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 2px;">File name</div>
          <div style="font-size: 0.95rem; font-weight: 600; color: #1f2937; word-break: break-all; line-height: 1.3;">
            ${currentProfile.company_cv_original_name || 'CompanyProfile.pdf'}
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="downloadCVFile('${currentProfile.company_cv_url}', '${currentProfile.company_cv_original_name || 'CompanyProfile.pdf'}')" style="flex: 1; background:#f3f4f6; color:#374151; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 500;">Download</button>
      </div>
    </div>`;
}

// ==========================================
// DOWNLOAD CV
// ==========================================

/**
 * EN: Downloads a file from a URL by fetching it as a Blob and triggering a
 *     programmatic <a> click with a download attribute. This forces the browser
 *     to save the file with the given filename rather than navigating to it.
 *     Falls back to a plain anchor open-in-new-tab approach when fetch fails
 *     (e.g. CORS policy on the storage URL), ensuring the user can still access
 *     the file even if the Blob download route is blocked.
 * FI: Lataa tiedoston URL:sta hakemalla sen Blob-muodossa ja käynnistämällä
 *     ohjelmallisen <a>-klikkauksen download-attribuutilla. Tämä pakottaa selaimen
 *     tallentamaan tiedoston annetulla tiedostonimellä navigoimisen sijaan.
 *     Palaa tavalliseen ankkuri-avaa-uudessa-välilehdessä-lähestymistapaan,
 *     kun fetch epäonnistuu (esim. CORS-käytäntö tallennuksen URL:ssa),
 *     varmistaen, että käyttäjä pääsee silti tiedostoon käsiksi, vaikka
 *     Blob-latausreitti olisi estetty.
 * @param {string} url - EN: public storage URL of the file / FI: tiedoston julkinen tallennuksen URL
 * @param {string} filename - EN: filename to use for the downloaded file / FI: ladattavan tiedoston tiedostonimi
 */
function downloadCVFile(url, filename) {
  if (!url) {
    showToast('No CV uploaded yet.', 'warning');
    return;
  }
  fetch(url)
    .then(response => response.blob())
    .then(blob => {
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'cv.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch(() => {
      // Fallback for networks that block fetch
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
}

/**
 * EN: Convenience wrapper for downloadCVFile() that reads the URL and filename
 *     from currentProfile. Used by the student profile page Download button
 *     so the caller doesn't need to pass arguments explicitly.
 * FI: Käytännöllinen kääre downloadCVFile()-funktiolle, joka lukee URL:n ja
 *     tiedostonimen currentProfile-muuttujasta. Käytetään opiskelijan profiilisivun
 *     Lataa-painikkeessa, jotta kutsujan ei tarvitse välittää argumentteja
 *     eksplisiittisesti.
 */
function downloadCV() {
  if (!currentProfile || !currentProfile.cv_url) {
    showToast('No CV uploaded yet.', 'warning');
    return;
  }
  downloadCVFile(currentProfile.cv_url, currentProfile.cv_original_name || 'cv.pdf');
}

// ==========================================
// PRACTICE REQUESTS
// ==========================================

/**
 * EN: Module-level state for the practice requests feature.
 *     practiceRequests: cached array of all requests for the current student.
 *     showAllRequests: toggle flag — when false, only active (non-expired) requests
 *       are shown; when true, all including past requests are displayed.
 *     reqSelectedCategoryIds: selected category IDs for the add-request modal,
 *       separate from selectedCategoryIds (which is for profile categories) to
 *       avoid state collision when both dropdowns can be open on the same page.
 * FI: Moduulitason tila harjoittelupyyntöominaisuudelle.
 *     practiceRequests: välimuistissa oleva taulukko kaikista nykyisen opiskelijan pyynnöistä.
 *     showAllRequests: vaihtoehtoinen lippu — kun false, näytetään vain aktiiviset
 *       (ei vanhentuneet) pyynnöt; kun true, näytetään kaikki mukaan lukien menneet pyynnöt.
 *     reqSelectedCategoryIds: valitut kategoriaID:t lisää-pyyntö-modaalille,
 *       erillään selectedCategoryIds:stä (joka on profiilikatgorioille) tilakollision
 *       välttämiseksi, kun molemmat valikkolistaukset voivat olla auki samalla sivulla.
 */
let practiceRequests = [];
let showAllRequests = false;
let showAllPostings = false;
let reqSelectedCategoryIds = [];
let currentEditRequestId = null;
let positionSelectedCategoryIds = [];
let positionDataMap = {}; // position_id → { groupIds, periodStart, periodEnd }
let _lastCompanyPostings = null;

function rerenderCompanyPostings() {
  if (_lastCompanyPostings !== null) fillCompanyPostings(_lastCompanyPostings);
}
let _spPositionId   = null;
let _spStudentId    = null;
let _spAppId        = null;
let _spStudentEmail = '';
let _lastCompanyApplications = null;

function rerenderCompanyApplications() {
  if (_lastCompanyApplications !== null) fillCompanyApplications(_lastCompanyApplications);
}

/**
 * EN: Fetches all practice requests for a student from Supabase including their
 *     linked categories (via student_request_categories) and the found company name
 *     (via Companies foreign key join aliased as Companies:found_company_id).
 *     The nested select avoids separate queries for each request's categories.
 *     Results are stored in the practiceRequests module variable and passed to
 *     fillPracticeRequests() for rendering.
 * FI: Hakee kaikki opiskelijan harjoittelupyynnöt Supabasesta mukaan lukien
 *     niiden linkitetyt kategoriat (student_request_categories-kautta) ja
 *     löydetyn yrityksen nimen (Companies-ulkoinen avain liitettynä Companies:found_company_id-nimellä).
 *     Sisäkkäinen select välttää erilliset kyselyt jokaisen pyynnön kategorioille.
 *     Tulokset tallennetaan practiceRequests-moduulimuuttujaan ja välitetään
 *     fillPracticeRequests()-funktiolle renderöintiä varten.
 * @param {string} studentId - EN: student_profiles.id / FI: student_profiles.id
 */
async function loadPracticeRequests(studentId) {
  const { data, error } = await supabaseClient
    .from('student_practice_requests')
    .select('*, student_request_categories(category_id, job_categories(title, group_id)), Companies:found_company_id(company_name)')
    .eq('student_id', studentId)
    .order('period_start', { ascending: false });

  if (error) { console.error('Error loading practice requests:', error); return; }
  practiceRequests = data || [];
  fillPracticeRequests();
}

/**
 * EN: Renders the practice request cards in the profile display panel.
 *     Splits requests into active (period_end >= today) and archived (expired)
 *     sets. When showAllRequests is false only active are shown; the toggle
 *     button reveals all. The today date is normalized to midnight local time
 *     so requests ending today are still counted as active (not expired).
 *     The "Show all" button label includes the total count so the user knows
 *     how many archived requests exist before expanding.
 * FI: Renderöi harjoittelupyyntöjen kortit profiilin näyttöpaneelissa.
 *     Jakaa pyynnöt aktiivisiin (period_end >= tänään) ja arkistoituihin
 *     (vanhentuneisiin) joukkoihin. Kun showAllRequests on false, näytetään
 *     vain aktiiviset; vaihtonappi paljastaa kaikki. Tämänpäivän päivämäärä
 *     normalisoidaan puoliyöhön paikallisessa ajassa, jotta tänään päättyvät
 *     pyynnöt lasketaan edelleen aktiivisiksi (ei vanhentuneiksi).
 *     "Näytä kaikki" -painikkeen otsikko sisältää kokonaismäärän, jotta käyttäjä
 *     tietää kuinka monta arkistoitua pyyntöä on ennen laajentamista.
 */
function fillPracticeRequests() {
  const container = document.getElementById('dPracticeRequests');
  const showAllWrap = document.getElementById('showAllRequestsWrap');
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = practiceRequests.filter(r => new Date(r.period_end) >= today);
  const archived = practiceRequests.filter(r => new Date(r.period_end) < today);
  const toShow = showAllRequests ? practiceRequests : active;

  if (practiceRequests.length === 0) {
    container.innerHTML = '<span class="profile-field-value empty">No internship requests added</span>';
    if (showAllWrap) showAllWrap.style.display = 'none';
    return;
  }

  container.innerHTML = toShow.length > 0
    ? toShow.map(r => renderRequestCard(r, today)).join('')
    : '<span class="profile-field-value empty">No active requests</span>';

  if (showAllWrap) {
    if (archived.length > 0) {
      showAllWrap.style.display = 'block';
      const btn = document.getElementById('showAllRequestsBtn');
      if (btn) btn.textContent = showAllRequests
        ? 'Show active only'
        : `Show all (${practiceRequests.length})`;
    } else {
      showAllWrap.style.display = 'none';
    }
  }
}

/**
 * EN: Generates the HTML markup for a single practice request card.
 *     Computes isExpired to style the card differently and show an "Expired" badge.
 *     The status toggle button dynamically decides whether clicking it should
 *     open the Found Company modal (when marking as found) or call the toggle
 *     directly (when reverting to searching) — this avoids two separate buttons.
 *     Company name prioritises the DB join (r.Companies.company_name) over the
 *     free-text fallback (r.found_company_name) for found requests.
 * FI: Luo HTML-merkinnän yksittäiselle harjoittelupyyntökortille.
 *     Laskee isExpired-arvon kortin erilaista tyylitystä varten ja näyttää
 *     "Vanhentunut"-merkkiä. Tilan vaihtonappi päättää dynaamisesti, pitäisikö
 *     klikkaaminen avata Löydetty yritys -modaali (merkittäessä löydetyksi)
 *     vai kutsua vaihtoa suoraan (palattaessa hakemiseen) — tämä välttää
 *     kahden erillisen painikkeen tarpeellisuuden. Yrityksen nimi priorisoi
 *     DB-liitoksen (r.Companies.company_name) vapaatekstiperusteisen varavalinnon
 *     (r.found_company_name) sijaan löydetyissä pyynnöissä.
 * @param {Object} r - EN: single practice request record with joined data / FI: yksittäinen harjoittelupyyntötietue liitetyillä tiedoilla
 * @param {Date} today - EN: current date normalized to midnight / FI: nykyinen päivämäärä normalisoituna puoliyöhön
 * @returns {string} EN: HTML string for the card / FI: HTML-merkkijono kortille
 */
function renderRequestCard(r, today) {
  const isExpired = new Date(r.period_end) < today;
  const cats = (r.student_request_categories || [])
    .map(sc => `<span class="category-tag" style="font-size:0.75rem; padding:0.2rem 0.5rem;">${sc.job_categories?.title || ''}</span>`)
    .join('');

  const statusLabel = r.status === 'found' ? 'Found' : 'Searching';
  const statusClass = r.status === 'found' ? 'status-found' : 'status-searching';
  const nextStatus = r.status === 'found' ? 'searching' : 'found';
  const nextLabel = r.status === 'found' ? 'Back to Searching' : 'Mark as Found';
  const companyName = r.Companies?.company_name || r.found_company_name || null;

  // Build "Find matches" URL from request period, student city, and top-level groups
  const groupIds = [...new Set(
    (r.student_request_categories || [])
      .map(sc => sc.job_categories?.group_id)
      .filter(Boolean)
  )];
  const catIds = (r.student_request_categories || [])
    .map(sc => sc.category_id)
    .filter(Boolean);

  return `
    <div class="practice-request-card${isExpired ? ' expired' : ''}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; flex-wrap:wrap;">
        <div>
          <span style="font-weight:600;">${formatDateEuropean(r.period_start)} — ${formatDateEuropean(r.period_end)}</span>
          ${isExpired ? '<span class="status-badge" style="background:#f3f4f6; color:#6b7280; margin-left:0.5rem;">Expired</span>' : ''}
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      ${cats ? `<div class="selected-categories" style="margin-top:0.5rem; gap:0.35rem;">${cats}</div>` : ''}
      ${companyName ? `<p style="margin:0.5rem 0 0; font-size:0.85rem;"><span style="color:var(--text-light);">Company:</span> <strong>${companyName}</strong></p>` : ''}
      ${r.notes ? `<p style="margin:0.4rem 0 0; font-size:0.85rem; color:var(--text-light);">${r.notes}</p>` : ''}
      <div style="display:flex; gap:0.5rem; margin-top:0.75rem; flex-wrap:wrap;">
        <button style="background:#eef2ff; color:var(--primary-color); border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;"
          onclick="${nextStatus === 'found' ? `openFoundCompanyModal(${r.request_id})` : `togglePracticeRequestStatus(${r.request_id}, 'searching')`}">${nextLabel}</button>
        <button style="background:#f8fafc; color:#374151; border:1px solid #e5e7eb; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;"
          onclick="openEditRequestModal(${r.request_id})">Edit</button>
        <button style="background:#fef2f2; color:#ef4444; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;"
          onclick="deletePracticeRequest(${r.request_id})">Delete</button>
        <button style="background:#f0fdf4; color:#16a34a; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;"
          onclick="goToMatchingPositions(${r.request_id})">🔍 Find matches</button>
      </div>
    </div>
  `;
}

/**
 * EN: Updates a practice request's status in Supabase and reloads the list.
 *     When reverting to 'searching', also nullifies found_company_id and
 *     found_company_name so the card no longer shows a company association —
 *     a clean state reset for the reversal flow. The 'found' path is not handled
 *     here; it goes through confirmMarkAsFound() via the Found Company modal.
 * FI: Päivittää harjoittelupyynnön tilan Supabasessa ja lataa listan uudelleen.
 *     Palatessa 'searching'-tilaan nollaa myös found_company_id:n ja
 *     found_company_name:n, jotta kortti ei enää näytä yritysassosiaatiota —
 *     puhdas tilanpalautus peruutusvirralle. 'found'-polkua ei käsitellä
 *     täällä; se menee confirmMarkAsFound()-funktion kautta Löydetty yritys -modaalin kautta.
 * @param {number} requestId - EN: student_practice_requests.request_id / FI: student_practice_requests.request_id
 * @param {string} newStatus - EN: 'searching' or 'found' / FI: 'searching' tai 'found'
 */
async function togglePracticeRequestStatus(requestId, newStatus) {
  const updates = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'searching') {
    updates.found_company_id = null;
    updates.found_company_name = null;
  }

  const { error } = await supabaseClient
    .from('student_practice_requests')
    .update(updates)
    .eq('request_id', requestId);

  if (error) { showToast('Error updating status: ' + error.message, 'error'); return; }

  await loadPracticeRequests(currentProfile.id);
}

/**
 * EN: Deletes a practice request from Supabase after user confirmation.
 *     On success, removes the item from the local practiceRequests array
 *     without re-fetching from DB — optimistic local update keeps the UI
 *     snappy. Cascading deletes in the DB handle student_request_categories
 *     rows automatically.
 * FI: Poistaa harjoittelupyynnön Supabasesta käyttäjän vahvistuksen jälkeen.
 *     Onnistuessaan poistaa kohteen paikallisesta practiceRequests-taulukosta
 *     ilman uudelleenhakua DB:stä — optimistinen paikallinen päivitys pitää
 *     käyttöliittymän virkeänä. DB:ssä olevat kaskadipoistot käsittelevät
 *     student_request_categories-rivit automaattisesti.
 * @param {number} requestId - EN: request_id to delete / FI: poistettava request_id
 */
async function deletePracticeRequest(requestId) {
  if (!await showConfirm('Delete this internship request?', 'Delete')) return;

  const { error } = await supabaseClient
    .from('student_practice_requests')
    .delete()
    .eq('request_id', requestId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  practiceRequests = practiceRequests.filter(r => r.request_id !== requestId);
  fillPracticeRequests();
}

/**
 * EN: Toggles the showAllRequests flag and re-renders the practice requests list.
 *     No DB call needed — the full list is already in practiceRequests memory.
 *     fillPracticeRequests() handles the show/hide logic based on the flag.
 * FI: Vaihtaa showAllRequests-lippua ja renderöi harjoittelupyyntölistauksen uudelleen.
 *     DB-kutsua ei tarvita — täydellinen lista on jo practiceRequests-muistissa.
 *     fillPracticeRequests() käsittelee näytä/piilota-logiikan lipun perusteella.
 */
function toggleShowAllRequests() {
  showAllRequests = !showAllRequests;
  fillPracticeRequests();
}

function toggleShowAllPostings() {
  showAllPostings = !showAllPostings;
  if (_lastCompanyPostings) fillCompanyPostings(_lastCompanyPostings);
}

// --- Add Request Modal ---

/**
 * EN: Opens the Add Practice Request modal with a clean slate. Resets
 *     reqSelectedCategoryIds to an empty array (not a reference copy) so that
 *     opening the modal a second time doesn't carry over selections from
 *     the previous open. Clears all form fields and rebuilds the dropdown
 *     before showing the modal.
 * FI: Avaa Lisää harjoittelupyyntö -modaalin puhtaalla pohjalla. Nollaa
 *     reqSelectedCategoryIds tyhjäksi taulukoksi (ei viittauskopiona), jotta
 *     modaalin avaaminen toisen kerran ei kanna yli valintoja edellisestä
 *     avauskerrasta. Tyhjentää kaikki lomakekentät ja rakentaa valikkolistauksen
 *     uudelleen ennen modaalin näyttämistä.
 */
// Builds the match URL at click time so city is always up-to-date.
function goToMatchingPositions(requestId) {
  const r = practiceRequests.find(req => req.request_id === requestId);
  if (!r) return;

  const groupIds = [...new Set(
    (r.student_request_categories || [])
      .map(sc => sc.job_categories?.group_id)
      .filter(Boolean)
  )];
  const catIds = (r.student_request_categories || [])
    .map(sc => sc.category_id)
    .filter(Boolean);

  const city = currentProfile?.city || localStorage.getItem('userCity') || '';
  const params = new URLSearchParams();
  if (city)            params.set('matchCity',   city);
  if (r.period_start)  params.set('matchStart',  r.period_start);
  if (r.period_end)    params.set('matchEnd',    r.period_end);
  if (groupIds.length) params.set('matchGroups', groupIds.join(','));
  if (catIds.length)   params.set('matchCatIds', catIds.join(','));

  window.location.href = `internships.html?${params.toString()}`;
}

function openAddRequestModal() {
  currentEditRequestId = null;
  reqSelectedCategoryIds = [];
  document.getElementById('reqPeriodStart').value = '';
  document.getElementById('reqPeriodEnd').value = '';
  document.getElementById('reqNotes').value = '';
  document.querySelector('#addRequestModal h3').textContent = 'Add Internship Request';
  renderReqSelectedCategories();
  buildReqCategoryDropdown('');
  document.getElementById('addRequestModal').style.display = 'block';
}

function openEditRequestModal(requestId) {
  const r = practiceRequests.find(req => req.request_id === requestId);
  if (!r) return;

  currentEditRequestId = requestId;
  reqSelectedCategoryIds = (r.student_request_categories || []).map(sc => sc.category_id);
  document.getElementById('reqPeriodStart').value = r.period_start || '';
  document.getElementById('reqPeriodEnd').value   = r.period_end   || '';
  document.getElementById('reqNotes').value       = r.notes        || '';
  document.querySelector('#addRequestModal h3').textContent = 'Edit Internship Request';
  renderReqSelectedCategories();
  buildReqCategoryDropdown('');
  document.getElementById('addRequestModal').style.display = 'block';
}

/**
 * EN: Closes the Add Practice Request modal without saving. State is left as-is
 *     but will be reset by openAddRequestModal() when the user opens it again.
 * FI: Sulkee Lisää harjoittelupyyntö -modaalin tallentamatta. Tila jätetään
 *     sellaisenaan, mutta openAddRequestModal() nollaa sen, kun käyttäjä
 *     avaa sen uudelleen.
 */
function closeAddRequestModal() {
  document.getElementById('addRequestModal').style.display = 'none';
}

/**
 * EN: Validates and saves a new practice request. Inserts the request row first
 *     with .select().single() to get the generated request_id, then inserts
 *     category rows in a second call. This two-step approach is necessary because
 *     the category rows need the request_id foreign key which only exists after
 *     the parent record is created. Reloads the full list from DB after save
 *     to ensure the UI is consistent with the server state.
 * FI: Validoi ja tallentaa uuden harjoittelupyynnön. Lisää pyyntörivin ensin
 *     .select().single()-kutsulla saadakseen generoidun request_id:n, sitten
 *     lisää kategoriarivit toisessa kutsussa. Tämä kaksivaiheinen lähestymistapa
 *     on välttämätön, koska kategoriarivit tarvitsevat request_id-ulkoisen avaimen,
 *     joka on olemassa vasta vanhemmatietueen luomisen jälkeen. Lataa koko listan
 *     uudelleen DB:stä tallennuksen jälkeen varmistaakseen, että käyttöliittymä
 *     on yhdenmukainen palvelimen tilan kanssa.
 */
async function savePracticeRequest() {
  const periodStart = document.getElementById('reqPeriodStart').value;
  const periodEnd   = document.getElementById('reqPeriodEnd').value;
  const notes       = document.getElementById('reqNotes').value.trim();

  if (!periodStart || !periodEnd) { showToast('Please set both start and end dates.', 'warning'); return; }
  if (periodEnd < periodStart)    { showToast('End date must be after start date.', 'warning'); return; }

  try {
    let requestId;

    if (currentEditRequestId) {
      // Update existing request
      const { error } = await supabaseClient
        .from('student_practice_requests')
        .update({ period_start: periodStart, period_end: periodEnd, notes: notes || null })
        .eq('request_id', currentEditRequestId);
      if (error) throw error;
      requestId = currentEditRequestId;

      // Replace categories: delete old, insert new
      await supabaseClient
        .from('student_request_categories')
        .delete()
        .eq('request_id', requestId);
    } else {
      // Insert new request
      const { data: newReq, error } = await supabaseClient
        .from('student_practice_requests')
        .insert({
          student_id:   currentProfile.id,
          period_start: periodStart,
          period_end:   periodEnd,
          status:       'searching',
          notes:        notes || null
        })
        .select()
        .single();
      if (error) throw error;
      requestId = newReq.request_id;
    }

    if (reqSelectedCategoryIds.length > 0) {
      const catRows = reqSelectedCategoryIds.map(catId => ({
        request_id:  requestId,
        category_id: catId
      }));
      const { error: catError } = await supabaseClient
        .from('student_request_categories')
        .insert(catRows);
      if (catError) throw catError;
    }

    await loadPracticeRequests(currentProfile.id);
    closeAddRequestModal();
  } catch (err) {
    console.error('Error saving request:', err);
    showToast('Error saving request: ' + err.message, 'error');
  }
}

// --- Category selector for request modal ---

/**
 * EN: Builds the category dropdown for the request modal, with optional text
 *     filtering applied at build time (rather than hiding DOM nodes like the
 *     profile dropdown does). This approach re-renders the dropdown HTML when
 *     the user types, which is acceptable because the dropdown is inside a modal
 *     that is not permanently visible. Filters by substring match on cat.title.
 * FI: Rakentaa kategoriavalikkolistauksen pyyntömodaalille valinnaisella teksti-
 *     suodatuksella sovellettuna rakennusaikana (DOM-solmujen piilottamisen sijaan
 *     kuten profiilivarikko tekee). Tämä lähestymistapa renderöi valikkolistauksen
 *     HTML:n uudelleen käyttäjän kirjoittaessa, mikä on hyväksyttävää, koska
 *     valikkolistaus on modaalissa, joka ei ole pysyvästi näkyvissä. Suodattaa
 *     osamerkkijonon vastaavuudella cat.title-kentässä.
 * @param {string} query - EN: filter string, empty string shows all / FI: suodatusmerkkijono, tyhjä merkkijono näyttää kaikki
 */
function buildReqCategoryDropdown(query) {
  const dropdown = document.getElementById('reqCategoryDropdown');
  if (!dropdown) return;

  const q = (query || '').toLowerCase();
  const groups = {};
  allCategories.forEach(cat => {
    if (q && !cat.title.toLowerCase().includes(q)) return;
    const groupTitle = cat.job_groups?.title || 'Other';
    if (!groups[groupTitle]) groups[groupTitle] = [];
    groups[groupTitle].push(cat);
  });

  dropdown.innerHTML = Object.entries(groups).map(([groupTitle, cats]) => `
    <div class="category-group-title">${groupTitle}</div>
    ${cats.map(cat => `
      <div class="category-option${reqSelectedCategoryIds.includes(cat.category_id) ? ' selected' : ''}"
           onclick="toggleReqCategory(${cat.category_id})"
           data-cat-title="${cat.title}">
        ${cat.title}
      </div>
    `).join('')}
  `).join('');
}

/**
 * EN: Shows the request-modal category dropdown, rebuilding it with the current
 *     search input value so the filtered view is consistent on focus.
 * FI: Näyttää pyyntömodaalin kategoriavalikkolistauksen rakentamalla sen uudelleen
 *     nykyisellä hakusyötteen arvolla, jotta suodatettu näkymä on johdonmukainen
 *     tarkennuksen yhteydessä.
 */
function showReqCategoryDropdown() {
  buildReqCategoryDropdown(document.getElementById('reqCategorySearch').value);
  document.getElementById('reqCategoryDropdown').classList.add('show');
}

/**
 * EN: Re-builds the request-modal category dropdown filtered by the current
 *     search input. Called on every keyup in the search field so the list
 *     narrows in real time.
 * FI: Rakentaa pyyntömodaalin kategoriavalikkolistauksen uudelleen suodatettuna
 *     nykyisellä hakusyötteellä. Kutsutaan jokaisella näppäimistön vapautuksella
 *     hakukentässä, jotta lista kapenee reaaliajassa.
 */
function filterReqCategories() {
  const query = document.getElementById('reqCategorySearch').value;
  buildReqCategoryDropdown(query);
  document.getElementById('reqCategoryDropdown').classList.add('show');
}

/**
 * EN: Adds or removes a category from reqSelectedCategoryIds (the request modal's
 *     category state). Rebuilds the dropdown after mutation to update the 'selected'
 *     highlight, passing the current search query so the filtered view is preserved.
 * FI: Lisää tai poistaa kategorian reqSelectedCategoryIds-taulukosta (pyyntömodaalin
 *     kategoriatila). Rakentaa valikkolistauksen uudelleen mutaation jälkeen
 *     päivittääkseen 'selected'-korostuksen, välittäen nykyisen hakukyselyn,
 *     jotta suodatettu näkymä säilyy.
 * @param {number} categoryId - EN: category_id to toggle / FI: category_id joka lisätään tai poistetaan
 */
function toggleReqCategory(categoryId) {
  if (reqSelectedCategoryIds.includes(categoryId)) {
    reqSelectedCategoryIds = reqSelectedCategoryIds.filter(id => id !== categoryId);
  } else {
    reqSelectedCategoryIds.push(categoryId);
  }
  renderReqSelectedCategories();
  buildReqCategoryDropdown(document.getElementById('reqCategorySearch').value);
}

/**
 * EN: Renders the selected-category chips for the request modal. Mirrors
 *     renderSelectedCategories() but operates on reqSelectedCategoryIds and
 *     #reqSelectedCategories so the two dropdowns don't share DOM state.
 *     Uses toggleReqCategory for removal so the dropdown highlights update.
 * FI: Renderöi valittujen kategorioiden napit pyyntömodaalille. Peilaa
 *     renderSelectedCategories()-funktiota, mutta toimii reqSelectedCategoryIds-
 *     taulukolla ja #reqSelectedCategories-elementillä, jotta kaksi valikkolistausta
 *     eivät jaa DOM-tilaa. Käyttää toggleReqCategory-funktiota poistamiseen,
 *     jotta valikkolistauksen korostukset päivittyvät.
 */
function renderReqSelectedCategories() {
  const container = document.getElementById('reqSelectedCategories');
  if (!container) return;
  container.innerHTML = reqSelectedCategoryIds.map(id => {
    const cat = allCategories.find(c => c.category_id === id);
    return cat ? `
      <span class="category-tag">
        ${cat.title}
        <button onclick="toggleReqCategory(${id})" type="button">×</button>
      </span>
    ` : '';
  }).join('');
}

// ==========================================
// FOUND COMPANY MODAL
// ==========================================

/**
 * EN: Module-level state for the Found Company modal.
 *     pendingFoundRequestId: the request_id currently being marked as found —
 *       carried from openFoundCompanyModal() through to confirmMarkAsFound().
 *     foundCompanyId: the company_id selected from the dropdown, or null if the
 *       user typed a free-text company name not in the Companies table.
 *     allCompanies: lazily loaded company name list, fetched once per modal open
 *       (not page load) to avoid an unnecessary query when the user never opens this modal.
 * FI: Moduulitason tila Löydetty yritys -modaalille.
 *     pendingFoundRequestId: request_id, jota merkitään parhaillaan löydetyksi —
 *       siirretty openFoundCompanyModal():sta confirmMarkAsFound():iin.
 *     foundCompanyId: valikkolistauksesta valittu company_id tai null, jos käyttäjä
 *       kirjoitti vapaatekstisen yrityksen nimen, joka ei ole Companies-taulukossa.
 *     allCompanies: laiskasti ladattu yrityksen nimilista, haettu kerran per modaalin
 *       avaus (ei sivun lataus) tarpeettoman kyselyn välttämiseksi, kun käyttäjä
 *       ei koskaan avaa tätä modaalia.
 */
let pendingFoundRequestId = null;
let foundCompanyId = null;
let allCompanies = [];

/**
 * EN: Opens the Found Company modal for a given practice request. Resets all
 *     modal state (input, dropdown, chip) before showing so leftover selections
 *     from a previous open don't appear. Loads the company list from Supabase
 *     only on the first modal open (allCompanies.length === 0 guard) — subsequent
 *     opens reuse the cached list for instant display.
 * FI: Avaa Löydetty yritys -modaalin tietylle harjoittelupyynnölle. Nollaa
 *     kaikki modaalin tilan (syöte, valikkolistaus, nappula) ennen näyttämistä,
 *     jotta edellisen avauksen ylijääneet valinnat eivät näy. Lataa yritysluettelon
 *     Supabasesta vain ensimmäisellä modaalin avauksella (allCompanies.length === 0
 *     -vartiolla) — myöhemmät avaukset käyttävät välimuistissa olevaa listaa
 *     välittömän näytön vuoksi.
 * @param {number} requestId - EN: the practice request to mark as found / FI: löydetyksi merkittävä harjoittelupyyntö
 */
async function openFoundCompanyModal(requestId) {
  pendingFoundRequestId = requestId;
  foundCompanyId = null;
  document.getElementById('foundCompanyInput').value = '';
  document.getElementById('foundCompanyDropdown').innerHTML = '';
  document.getElementById('foundCompanyDropdown').classList.remove('show');
  document.getElementById('foundCompanyChip').style.display = 'none';
  document.getElementById('foundCompanyChip').innerHTML = '';

  // Load companies once per modal open
  if (allCompanies.length === 0) {
    const { data } = await supabaseClient
      .from('Companies')
      .select('company_id, company_name')
      .order('company_name');
    allCompanies = data || [];
  }

  document.getElementById('foundCompanyModal').style.display = 'block';
}

/**
 * EN: Closes the Found Company modal and clears the pending state variables.
 *     Clearing pendingFoundRequestId prevents confirmMarkAsFound() from
 *     accidentally updating a stale request if the modal state is somehow
 *     triggered after close.
 * FI: Sulkee Löydetty yritys -modaalin ja tyhjentää odottavat tilamuuttujat.
 *     pendingFoundRequestId:n tyhjentäminen estää confirmMarkAsFound():tä
 *     päivittämästä vahingossa vanhentunutta pyyntöä, jos modaalin tila
 *     jollain tavoin käynnistyy sulkemisen jälkeen.
 */
function closeFoundCompanyModal() {
  document.getElementById('foundCompanyModal').style.display = 'none';
  pendingFoundRequestId = null;
  foundCompanyId = null;
}

/**
 * EN: Shows the company search dropdown on input focus using the current input value.
 *     Delegates to renderFoundCompanyDropdown() which handles filtering.
 * FI: Näyttää yrityshaun valikkolistauksen syöttötarkennuksessa käyttäen nykyistä
 *     syöttöarvoa. Delegoi renderFoundCompanyDropdown()-funktiolle, joka käsittelee suodatuksen.
 */
function showFoundCompanyDropdown() {
  renderFoundCompanyDropdown(document.getElementById('foundCompanyInput').value);
}

/**
 * EN: Handles input changes in the company search field. If a company was
 *     previously selected (foundCompanyId is set), clears the selection and
 *     hides the chip — the user has started a new search. Then re-renders
 *     the dropdown with the new query.
 * FI: Käsittelee syöttömuutokset yrityshaun kentässä. Jos yritys oli
 *     aiemmin valittu (foundCompanyId on asetettu), tyhjentää valinnan ja
 *     piilottaa napin — käyttäjä on aloittanut uuden haun. Sitten renderöi
 *     valikkolistauksen uudelleen uudella kyselyllä.
 * @param {string} query - EN: current input text / FI: nykyinen syöteteksti
 */
function searchFoundCompany(query) {
  if (foundCompanyId) {
    foundCompanyId = null;
    document.getElementById('foundCompanyChip').style.display = 'none';
  }
  renderFoundCompanyDropdown(query);
}

/**
 * EN: Renders filtered company options in the Found Company dropdown. An empty
 *     query shows all companies. Returns without showing the dropdown if no
 *     companies match, preventing an empty floating box from appearing.
 * FI: Renderöi suodatetut yritysvalinnat Löydetty yritys -valikkolistauksessa.
 *     Tyhjä kysely näyttää kaikki yritykset. Palaa näyttämättä valikkolistausta,
 *     jos yhtään yritystä ei vastaa, estäen tyhjän kelluvan ruudun ilmestymistä.
 * @param {string} query - EN: filter text, empty = show all / FI: suodatusteksti, tyhjä = näytä kaikki
 */
function renderFoundCompanyDropdown(query) {
  const dropdown = document.getElementById('foundCompanyDropdown');
  const q = (query || '').toLowerCase().trim();

  const filtered = q
    ? allCompanies.filter(c => c.company_name.toLowerCase().includes(q))
    : allCompanies;

  if (filtered.length === 0) {
    dropdown.classList.remove('show');
    return;
  }

  dropdown.innerHTML = filtered.map(c => `
    <div class="category-option" onclick="selectFoundCompany(${c.company_id}, '${c.company_name.replace(/'/g, "\\'")}')">
      ${c.company_name}
    </div>
  `).join('');
  dropdown.classList.add('show');
}

/**
 * EN: Stores the selected company and updates the UI. Populates the text input
 *     with the company name (for display), hides the dropdown, and shows a
 *     confirmation chip below the input. The chip's × button calls clearFoundCompany()
 *     so the user can deselect and search again.
 * FI: Tallentaa valitun yrityksen ja päivittää käyttöliittymän. Täyttää tekstisyötteen
 *     yrityksen nimellä (näyttämistä varten), piilottaa valikkolistauksen ja näyttää
 *     vahvistusnapin syötteen alapuolella. Napin ×-painike kutsuu clearFoundCompany()-
 *     funktiota, jotta käyttäjä voi poistaa valinnan ja hakea uudelleen.
 * @param {number} companyId - EN: Companies.company_id / FI: Companies.company_id
 * @param {string} companyName - EN: display name for the chip / FI: napin näyttönimi
 */
function selectFoundCompany(companyId, companyName) {
  foundCompanyId = companyId;
  document.getElementById('foundCompanyInput').value = companyName;
  document.getElementById('foundCompanyDropdown').classList.remove('show');

  const chip = document.getElementById('foundCompanyChip');
  chip.style.display = 'block';
  chip.innerHTML = `
    <span class="category-tag" style="font-size:0.85rem;">
      ${companyName}
      <button type="button" onclick="clearFoundCompany()">×</button>
    </span>
  `;
}

/**
 * EN: Clears the found company selection — nullifies foundCompanyId, blanks the
 *     input, and hides the chip. The user can then type a new search or close
 *     the modal. The company list (allCompanies) is not cleared since it can be
 *     reused for the new search.
 * FI: Tyhjentää löydetyn yrityksen valinnan — nollaa foundCompanyId:n, tyhjentää
 *     syötteen ja piilottaa napin. Käyttäjä voi sitten kirjoittaa uuden haun tai
 *     sulkea modaalin. Yritysluetteloa (allCompanies) ei tyhjennetä, koska sitä
 *     voidaan käyttää uudelleen uudessa haussa.
 */
function clearFoundCompany() {
  foundCompanyId = null;
  document.getElementById('foundCompanyInput').value = '';
  document.getElementById('foundCompanyChip').style.display = 'none';
}

/**
 * EN: Saves the "found" status for a practice request. Supports two modes:
 *     1. Company from DB: found_company_id is set, found_company_name stays null
 *        (the JOIN in loadPracticeRequests will supply the name on reload).
 *     2. Free-text company: foundCompanyId is null so the typed name is saved
 *        directly to found_company_name for display without a JOIN.
 *     After updating, reloads the request list and closes the modal.
 * FI: Tallentaa "löydetty"-tilan harjoittelupyynnölle. Tukee kahta tilaa:
 *     1. Yritys DB:stä: found_company_id on asetettu, found_company_name pysyy
 *        nullina (JOIN loadPracticeRequests():ssa toimittaa nimen uudelleenlatauksen yhteydessä).
 *     2. Vapaatekstiyritys: foundCompanyId on null, joten kirjoitettu nimi tallennetaan
 *        suoraan found_company_name-kenttään näyttämistä varten ilman JOIN-kyselyä.
 *     Päivityksen jälkeen lataa pyyntölistan uudelleen ja sulkee modaalin.
 */
async function confirmMarkAsFound() {
  if (!pendingFoundRequestId) return;

  const input = document.getElementById('foundCompanyInput').value.trim();
  const updates = {
    status: 'found',
    updated_at: new Date().toISOString(),
    found_company_id: foundCompanyId || null,
    found_company_name: !foundCompanyId && input ? input : null
  };

  const { error } = await supabaseClient
    .from('student_practice_requests')
    .update(updates)
    .eq('request_id', pendingFoundRequestId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  await loadPracticeRequests(currentProfile.id);
  closeFoundCompanyModal();
}

// Close found-company dropdown when clicking outside
document.addEventListener('click', function(e) {
  const input = document.getElementById('foundCompanyInput');
  const dropdown = document.getElementById('foundCompanyDropdown');
  if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// ==========================================
// DELETE ACCOUNT (GDPR Art. 17)
// ==========================================

/**
 * EN: Opens the account deletion confirmation modal with a clean state.
 *     Clears the confirmation input and hides any previous error message so
 *     re-opening after a failed attempt doesn't show stale error text.
 * FI: Avaa tilin poistamisen vahvistusmodaalin puhtaalla tilalla.
 *     Tyhjentää vahvistussyötteen ja piilottaa mahdolliset aiemmat
 *     virheilmoitukset, jotta epäonnistuneen yrityksen jälkeen uudelleen
 *     avaaminen ei näytä vanhentunutta virhetekstiä.
 */
function openDeleteAccountModal() {
  document.getElementById('deleteConfirmInput').value = '';
  document.getElementById('deleteAccountError').style.display = 'none';
  document.getElementById('deleteAccountModal').style.display = 'block';
}

/**
 * EN: Closes the account deletion modal without performing any action.
 * FI: Sulkee tilin poistamisen modaalin ilman toimia.
 */
function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal').style.display = 'none';
}

/**
 * EN: Implements the GDPR Art. 17 "right to erasure" account deletion flow.
 *     Requires the user to type "DELETE" (uppercase) to prevent accidental
 *     deletion — a typed confirmation is deliberately hard to do by mistake.
 *     The deletion sequence:
 *       1. Removes the CV file from 'practice-files' storage.
 *       2. Removes the avatar from 'foto' storage.
 *       3. Batch-removes all application CV files from 'resumes' storage.
 *       4. Deletes the Users row — DB cascade removes student_profiles,
 *          applications, student_categories, Student_links, and practice requests.
 *       5. Calls the delete_auth_user_by_email RPC to remove the Supabase Auth
 *          identity (service-role operation wrapped in a DB function for security).
 *       6. Clears all localStorage keys and redirects to index.html.
 *     Storage paths are extracted by splitting on the known bucket-name segment
 *     because the public URL format is: .../storage/v1/object/public/{bucket}/{path}.
 *     RPC errors are logged but don't abort the flow since the Users row is already gone.
 * FI: Toteuttaa GDPR:n 17. artiklan "oikeus tulla unohdetuksi" -tilin poistamisen virran.
 *     Vaatii käyttäjää kirjoittamaan "DELETE" (isoin kirjaimin) vahingollisen poistamisen
 *     estämiseksi — kirjoitettu vahvistus on tarkoituksellisesti vaikea tehdä vahingossa.
 *     Poistamissekvenssi:
 *       1. Poistaa CV-tiedoston 'practice-files'-tallennuksesta.
 *       2. Poistaa avatarin 'foto'-tallennuksesta.
 *       3. Poistaa kaikki hakemusten CV-tiedostot eräajona 'resumes'-tallennuksesta.
 *       4. Poistaa Users-rivin — DB-kaskadi poistaa student_profiles-, applications-,
 *          student_categories-, Student_links- ja practice_requests-rivit.
 *       5. Kutsuu delete_auth_user_by_email-RPC:tä poistaakseen Supabase Auth
 *          -identiteetin (palveluroolin toiminto käärittynä DB-funktioon turvallisuuden vuoksi).
 *       6. Tyhjentää kaikki localStorage-avaimet ja ohjaa index.html:ään.
 *     Tallennuspolut poimitaan jakamalla tunnetun säilö-nimiosan kohdalta, koska
 *     julkisen URL:n muoto on: .../storage/v1/object/public/{bucket}/{path}.
 *     RPC-virheet kirjataan lokiin, mutta eivät keskeytä virtaa, koska Users-rivi on jo poistettu.
 */
async function confirmDeleteAccount() {
  const input = document.getElementById('deleteConfirmInput').value.trim();
  const errorEl = document.getElementById('deleteAccountError');

  if (input.toLowerCase() !== 'delete') {
    errorEl.textContent = 'Please type Delete to confirm.';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';

  const session = getCurrentSession();
  if (!session) {
    errorEl.textContent = 'Session not found. Please log in again.';
    errorEl.style.display = 'block';
    return;
  }

  if (!currentProfile) {
    const { data: profile } = await supabaseClient
      .from('student_profiles')
      .select('*')
      .eq('user_id', session.userId)
      .single();
    if (profile) currentProfile = profile;
  }

  const deleteBtn = document.getElementById('confirmDeleteBtn');
  if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting...'; }

  try {
    // 1. Delete CV file from storage
    if (currentProfile.cv_url) {
      const cvPath = currentProfile.cv_url.split('/practice-files/')[1]?.split('?')[0];
      if (cvPath) {
        await supabaseClient.storage.from('practice-files').remove([decodeURIComponent(cvPath)]);
      }
    }

    // 2. Delete avatar from storage
    if (currentProfile.photo_url) {
      const photoPath = currentProfile.photo_url.split('/foto/')[1]?.split('?')[0];
      if (photoPath) {
        await supabaseClient.storage.from('foto').remove([decodeURIComponent(photoPath)]);
      }
    }

    // 3. Delete CV files from resumes bucket (uploaded with applications)
    const { data: apps } = await supabaseClient
      .from('applications')
      .select('cv_url')
      .eq('student_id', currentProfile.id);
    if (apps?.length) {
      const paths = apps
        .map(a => a.cv_url?.split('/resumes/')[1]?.split('?')[0])
        .filter(Boolean)
        .map(p => decodeURIComponent(p));
      if (paths.length) await supabaseClient.storage.from('resumes').remove(paths);
    }

    // 4. Delete user record — cascades to student_profiles, applications,
    //    student_categories, Student_links, student_practice_requests, etc.
    const { error } = await supabaseClient
      .from('Users')
      .delete()
      .eq('user_id', session.userId);

    if (error) throw error;

    // 5. Delete from Supabase Auth by email
    const { error: rpcError } = await supabaseClient.rpc('delete_auth_user_by_email', { p_email: session.login });
    if (rpcError) console.error('[DeleteAccount] RPC error:', rpcError.message);

    // 6. Clear session and redirect
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userLogin');
    localStorage.removeItem('isLoggedIn');

    window.location.href = 'index.html';

  } catch (err) {
    console.error('Delete account error:', err);
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.style.display = 'block';
    if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete permanently'; }
  }
}