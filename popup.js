const PROGRESS_API_BASE = 'https://progres.mesrs.dz/api';

let currentUser = null;
let authToken = null;
let enrollments = [];
let selectedEnrollment = null;

const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const contentScreen = document.getElementById('contentScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginLoading = document.getElementById('loginLoading');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Progress Algeria Extension loaded');

    checkWebMode();

    await checkAuthStatus();
    setupEventListeners();
});

function checkWebMode() {
      const isWebMode = (
          window.location.href.includes('chrome-extension://') &&
        window.location.href.includes('popup.html') &&
         window.innerWidth > 600 &&
         window.self === window.top &&
          !window.location.search.includes('panel')
    );

    console.log('🔍 Web mode detection:', {
        href: window.location.href,
        innerWidth: window.innerWidth,
        outerWidth: window.outerWidth,
        isTopWindow: window.self === window.top,
        isWebMode: isWebMode
    });

    if (isWebMode) {
        console.log('🌐 Detected web mode - hiding web button');

          document.body.classList.add('web-mode');

          setTimeout(() => {
            const webBtn = document.getElementById('openWebBtn');
            if (webBtn) {
                webBtn.style.display = 'none';
                console.log('🌐 Web button hidden');
            }
        }, 100);
    } else {
        console.log('📱 Detected side panel mode - keeping web button visible');
          setTimeout(() => {
            const webBtn = document.getElementById('openWebBtn');
            if (webBtn) {
                webBtn.style.display = 'flex';
                console.log('📱 Web button made visible');
            }
        }, 100);
    }
}

async function checkAuthStatus() {
    try {
        console.log('🔍 Checking existing authentication status...');

         if (!chrome || !chrome.storage || !chrome.storage.local) {
            console.warn('⚠️ Chrome storage API not available, showing login');
            showLogin();
            return;
        }

        const stored = await chrome.storage.local.get(['authToken', 'currentUser', 'authContext', 'lastLoginTime']);

        if (stored.authToken && stored.currentUser && stored.authContext) {
              const lastLogin = stored.lastLoginTime ? new Date(stored.lastLoginTime) : null;
            const sessionAge = lastLogin ? (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60) : 0;

            if (sessionAge < 24) {
                authToken = stored.authToken;
                currentUser = stored.currentUser;

                console.log(`✅ Restored session for ${currentUser.name} (${sessionAge.toFixed(1)}h old)`);
                showDashboard();
            } else {
                console.log('⚠️ Session expired, requiring fresh login');
                if (chrome.storage && chrome.storage.local) {
                    await chrome.storage.local.clear();
                }
                showLogin();
            }
        } else {
            console.log('🔐 No valid session found, showing login');
            showLogin();
        }
    } catch (error) {
        console.error('❌ Error checking auth status:', error);
        try {
            if (chrome.storage && chrome.storage.local) {
                await chrome.storage.local.clear(); 
            }
        } catch (clearError) {
            console.warn('⚠️ Could not clear storage:', clearError);
        }
        showLogin();
    }
}

function setupEventListeners() {
  
    loginForm.addEventListener('submit', handleLogin);
    
    
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

     const enrollmentSelect = document.getElementById('enrollmentSelect');
    if (enrollmentSelect) {
        enrollmentSelect.addEventListener('change', handleEnrollmentChange);
    }

     const openWebBtn = document.getElementById('openWebBtn');
    if (openWebBtn) {
        openWebBtn.addEventListener('click', openInNewTab);
        console.log('✅ Web button found and event listener added');
    } else {
        console.error('❌ Web button not found in DOM');
    }
    
      document.getElementById('gradesBtn').addEventListener('click', () => showGrades());
    document.getElementById('scheduleBtn').addEventListener('click', () => showSchedule());
    document.getElementById('bilanBtn').addEventListener('click', () => showBilan());
    document.getElementById('studentInfoBtn').addEventListener('click', () => showStudentInfo());
    document.getElementById('groupsBtn').addEventListener('click', () => showGroups());
    document.getElementById('yearlyBilanBtn').addEventListener('click', () => showYearlyBilan());
     document.getElementById('backBtn').addEventListener('click', showDashboard);
}

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    showLoading(true);
    hideError();

    try {
        console.log('🔐 Attempting authentication...');
         const authUrl = `${PROGRESS_API_BASE}/authentication/v1/ `;
        console.log('Auth URL:', authUrl);

        const authResponse = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify({ username, password })
        });

        if (!authResponse.ok) {
            throw new Error('Invalid credentials');
        }

        const authData = await authResponse.json();
        const {
            token: externalToken,
            userId: externalUserId,
            uuid,
            idIndividu,
            etablissementId,
            userName,
        } = authData;

        authToken = externalToken;

          console.log(`🎓 Retrieving academic records for student: ${uuid}`);
        const studentUrl = `${PROGRESS_API_BASE}/infos/bac/${uuid}/dias`;
        console.log('Student data URL:', studentUrl);

        const studentResponse = await fetch(studentUrl, {
            method: 'GET',
            headers: {
                'Authorization': authToken,
                'Accept': 'application/json',
                'User-Agent': 'progres-Algeria-Extension/1.0'
            },
            mode: 'cors'
        });

        if (!studentResponse.ok) {
            throw new Error(`Failed to fetch student academic data: ${studentResponse.status} ${studentResponse.statusText}`);
        }

        const studentEnrollmentData = await studentResponse.json();
        const primaryEnrollment = studentEnrollmentData[0];

        if (!primaryEnrollment || !primaryEnrollment.individuNomLatin) {
            throw new Error('No valid student enrollment data found');
        }

        console.log(`✅ Found ${studentEnrollmentData.length} enrollment(s) for ${primaryEnrollment.individuNomLatin} ${primaryEnrollment.individuPrenomLatin}`);

         let profilePic = null;
        try {
            console.log('📸 Retrieving student profile photo...');
            const photoUrl = `${PROGRESS_API_BASE}/infos/image/${uuid}`;
            console.log('Photo URL:', photoUrl);

            const photoResponse = await fetch(photoUrl, {
                method: 'GET',
                headers: {
                    'Authorization': authToken,
                    'Accept': 'image/png',
                    'Cache-Control': 'no-cache'
                },
                mode: 'cors'
            });

            if (photoResponse.ok) {
                const photoBuffer = await photoResponse.arrayBuffer();
                   const uint8Array = new Uint8Array(photoBuffer);
                const asciiData = Array.from(uint8Array)
                    .map(byte => String.fromCharCode(byte))
                    .join('');
                profilePic = `data:image/png;base64,${asciiData}`;
                console.log('✅ Profile photo retrieved successfully');
            } else {
                console.warn(`⚠️ Profile photo not available (${photoResponse.status})`);
            }
        } catch (photoError) {
            console.warn('⚠️ Could not fetch profile photo:', photoError.message);
        }

         currentUser = {
              id: externalUserId,
            uuid: uuid,
            idIndividu: idIndividu,
            userName: userName,

              name: `${primaryEnrollment.individuNomLatin} ${primaryEnrollment.individuPrenomLatin}`,
            firstName: primaryEnrollment.individuPrenomLatin,
            lastName: primaryEnrollment.individuNomLatin,
            dateOfBirth: primaryEnrollment.individuDateNaissance,
            placeOfBirth: primaryEnrollment.individuLieuNaissance,

              role: 'student',
            etablissementId: etablissementId,
            institution: primaryEnrollment.llEtablissementLatin,

            profilePic: profilePic,

             loginTimestamp: new Date().toISOString(),
            totalEnrollments: studentEnrollmentData.length
        };

         const sessionData = {
            authToken: authToken,
            currentUser: currentUser,
             authContext: {
                uuid: uuid,
                userId: externalUserId,
                idIndividu: idIndividu,
                etablissementId: etablissementId,
                userName: userName,
                tokenExpiry: null         },
            lastLoginTime: new Date().toISOString()
        };

        try {
            if (chrome && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set(sessionData);
                console.log('✅ User session established successfully');
            } else {
                console.warn('⚠️ Chrome storage not available, session will not persist');
            }
        } catch (storageError) {
            console.warn('⚠️ Failed to store session data:', storageError);
        }

        showDashboard();

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please check your credentials.');
    } finally {
        showLoading(false);
    }
}

async function handleLogout() {
    console.log('🚪 Logging out user:', currentUser?.name);

    try {
         if (chrome && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.clear();
            console.log('✅ Cleared stored session data');
        }
    } catch (error) {
        console.warn('⚠️ Error clearing storage:', error);
    }

    authToken = null;
    currentUser = null;
    enrollments = [];
    selectedEnrollment = null;
    window.currentSemesters = [];

    console.log('✅ Logout completed successfully');
    showLogin();
}

function openInNewTab() {
    console.log('🌐 Opening extension in new tab');

    if (chrome && chrome.tabs) {
        chrome.tabs.create({
            url: chrome.runtime.getURL('popup.html')
        });
    } else {
        window.open(chrome.runtime.getURL('popup.html'), '_blank');
    }
}

function getGradeClass(grade) {
    if (grade === 'N/A' || grade === null || grade === undefined) {
        return 'na';
    }

    const numericGrade = parseFloat(grade);
    if (isNaN(numericGrade)) {
        return 'na';
    }

    if (numericGrade >= 16) {
        return 'excellent';
    } else if (numericGrade >= 14) {
        return 'good';
    } else if (numericGrade >= 10) {
        return 'average';
    } else {
        return 'poor';
    }
}

function createUniversityTimetable(sessions) {
     const timeSlots = [
        { start: '08:00', end: '09:30', label: '08:00 - 09:30' },
        { start: '09:45', end: '11:15', label: '09:45 - 11:15' },
        { start: '11:30', end: '13:00', label: '11:30 - 13:00' },
        { start: '13:00', end: '14:00', label: 'Break', isBreak: true },
        { start: '14:00', end: '15:30', label: '14:00 - 15:30' },
        { start: '15:45', end: '17:15', label: '15:45 - 17:15' }
    ];

    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const timetable = {};
    days.forEach(day => {
        timetable[day] = {};
        timeSlots.forEach(slot => {
            timetable[day][slot.label] = null;
        });
    });


    sessions.forEach(session => {
        const day = session.jourLibelleFr || session.jourLibelleAr;
        const startTime = session.plageHoraireHeureDebut;
        const endTime = session.plageHoraireHeureFin;

        if (day && startTime) {

            const matchingSlot = timeSlots.find(slot => {
                if (slot.isBreak) return false;
                return startTime.includes(slot.start.substring(0, 2)) ||
                       startTime === slot.start ||
                       (startTime >= slot.start && startTime <= slot.end);
            });

            if (matchingSlot && timetable[day]) {
                timetable[day][matchingSlot.label] = {
                    subject: session.matiere || session.matiereAr || 'N/A',
                    room: session.refLieuDesignation || 'N/A',
                    type: session.ap || 'N/A',
                    startTime: startTime,
                    endTime: endTime
                };
            }
        }
    });

    let html = '<div class="schedule-container"><div class="schedule-grid">';
    html += '<div class="time-header">Time</div>';
    days.forEach(day => {
        html += `<div class="day-header">${day}</div>`;
    });

    timeSlots.forEach(slot => {
        html += `<div class="time-header">${slot.label}</div>`;

        days.forEach(day => {
            const session = timetable[day][slot.label];

            if (slot.isBreak) {
                html += '<div class="schedule-cell break-time">Break Time</div>';
            } else if (session) {
                html += `<div class="schedule-cell">
                    <div class="class-session ${session.type}">
                        <div class="subject">${session.subject}</div>
                        <div class="room">${session.room}</div>
                        <div class="type">${session.type}</div>
                    </div>
                </div>`;
            } else {
                html += '<div class="schedule-cell"></div>';
            }
        });
    });

    html += '</div></div>';
    return html;
}



function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    contentScreen.classList.add('hidden');
    

    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

async function showDashboard() {
    console.log('🏠 Loading dashboard for', currentUser.name);

    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    contentScreen.classList.add('hidden');

    const userNameElement = document.getElementById('userName');
    const userRoleElement = document.getElementById('userRole');
    const userPhotoElement = document.getElementById('userPhoto');

    userNameElement.textContent = currentUser.name || currentUser.userName;

    const roleText = currentUser.institution ?
        `${currentUser.role || 'Student'} • ${currentUser.institution}` :
        (currentUser.role || 'Student');
    userRoleElement.textContent = roleText;

    if (currentUser.profilePic) {
        userPhotoElement.src = currentUser.profilePic;
        userPhotoElement.style.display = 'block';
    } else {
         userPhotoElement.style.display = 'none';
         }

    updateMenuButtonsState(false);

    console.log('📚 Loading academic enrollments...');
    await loadEnrollments();

    console.log('✅ Dashboard loaded successfully');

    setTimeout(() => {
        const webBtn = document.getElementById('openWebBtn');
        if (webBtn) {
            const isVisible = window.getComputedStyle(webBtn).display !== 'none';
            console.log('🌐 Web button visibility check:', {
                exists: !!webBtn,
                display: window.getComputedStyle(webBtn).display,
                isVisible: isVisible
            });

             if (!document.body.classList.contains('web-mode') && !isVisible) {
                webBtn.style.display = 'flex';
                console.log('🌐 Forced web button to be visible');
            }
        }

        if (window.innerWidth < 768) {
            addSwipeIndicatorsToDashboard();
        }
    }, 500);
}

function addSwipeIndicatorsToDashboard() {
    const dashboard = document.querySelector('.dashboard');
    if (!dashboard || document.querySelector('.swipe-indicators')) return;

    const indicatorsHtml = `
        <div class="swipe-indicators">
            ${pages.map((_, index) => `<div class="swipe-dot ${index === 0 ? 'active' : ''}" data-page="${index}"></div>`).join('')}
        </div>
        <div class="swipe-hint">← Swipe to navigate between pages →</div>
    `;

    dashboard.insertAdjacentHTML('beforeend', indicatorsHtml);


    document.querySelectorAll('.swipe-dot').forEach((dot, index) => {
        dot.addEventListener('click', () => {
            const pageFunctions = [showGrades, showSchedule, showBilan, showStudentInfo, showGroups, showYearlyBilan];

            if (pageFunctions[index]) {
                pageFunctions[index]();
            }
        });
    });
}
async function loadEnrollments() {
    try {
        console.log('📋 Fetching enrollment history...');
        console.log('📋 Current user UUID:', currentUser.uuid);

        const enrollmentData = await progresApiCall(`/infos/bac/${currentUser.uuid}/dias`);

        console.log('📋 Raw enrollment data:', enrollmentData);
        console.log('📋 Enrollment data type:', typeof enrollmentData);
        console.log('📋 Is array:', Array.isArray(enrollmentData));
        console.log('📋 Length:', enrollmentData ? enrollmentData.length : 'null/undefined');

         enrollments = enrollmentData.map((enrollment, index) => {
            console.log(`📋 Processing enrollment ${index}:`, enrollment);

            const processedEnrollment = {
                 id: enrollment.id,
                niveauId: enrollment.niveauId,
                offreFormationId: enrollment.ouvertureOffreFormationId,

               anneeAcademiqueCode: enrollment.anneeAcademiqueCode,
                ofLlFiliere: enrollment.ofLlFiliere,
                ofLlDomaine: enrollment.ofLlDomaine,
                niveauLibelleLongLt: enrollment.niveauLibelleLongLt,

                llEtablissementLatin: enrollment.llEtablissementLatin,

                 ofLlFiliereWithCycle: `${enrollment.ofLlFiliere} - ${enrollment.refLibelleCycle}`,
                displayName: `${enrollment.anneeAcademiqueCode} - ${enrollment.ofLlFiliere}`,

                 isCurrentYear: index === 0,
                cycle: enrollment.refLibelleCycle,

                 _raw: enrollment
            };

            console.log(`📋 Processed enrollment ${index}:`, processedEnrollment);
            return processedEnrollment;
        });

        console.log(`✅ Loaded ${enrollments.length} enrollment(s)`);
        console.log('📋 Final enrollments array:', enrollments);

        await populateEnrollmentSelect();

    } catch (error) {
        console.error('❌ Error loading enrollments:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });

         const select = document.getElementById('enrollmentSelect');
        if (select) {
            select.innerHTML = '<option value="">Error loading academic years</option>';
        }
    }
}
async function populateEnrollmentSelect() {
    console.log('📋 populateEnrollmentSelect called');
    console.log('📋 enrollments array:', enrollments);
    console.log('📋 enrollments length:', enrollments.length);

    const select = document.getElementById('enrollmentSelect');
    if (!select) {
        console.error('❌ Enrollment select element not found');
        return;
    }

    select.innerHTML = '<option value="">Choose your academic year...</option>';
    console.log('📋 Cleared select options');

    enrollments.forEach((enrollment, index) => {
        console.log(`📋 Adding option ${index}:`, enrollment);

        const option = document.createElement('option');
        option.value = enrollment.id;
        const displayText = `${enrollment.anneeAcademiqueCode} - ${enrollment.ofLlFiliere}`;
        const levelText = enrollment.niveauLibelleLongLt ? ` (${enrollment.niveauLibelleLongLt})` : '';

        option.textContent = displayText + levelText;
        if (enrollment.isCurrentYear) {
            option.textContent += ' 🎓';
        }

        console.log(`📋 Option ${index} text:`, option.textContent);
        console.log(`📋 Option ${index} value:`, option.value);

        select.appendChild(option);
    });

    console.log(`📋 Added ${enrollments.length} options to select`);
    if (enrollments.length > 0) {
        let targetEnrollmentId = null;
        if (window.selectedEnrollmentId) {
            const storedEnrollment = enrollments.find(e => e.id == window.selectedEnrollmentId);
            if (storedEnrollment) {
                targetEnrollmentId = window.selectedEnrollmentId;
                console.log(`📅 Restoring previous selection: ${storedEnrollment.displayName}`);
            }
        }
        if (!targetEnrollmentId) {
            targetEnrollmentId = enrollments[0].id;
            console.log(`📅 Auto-selecting most recent: ${enrollments[0].displayName}`);
        }
        if (select.value !== targetEnrollmentId) {
            select.value = targetEnrollmentId;
            console.log(`📅 Setting dropdown to: ${targetEnrollmentId}`);
        }
        await handleEnrollmentChange();
        console.log('📅 Enrollment selection completed');
    } else {
        console.log('📅 No enrollments to select');
    }
}
async function handleEnrollmentChange() {
    console.log('🔄 handleEnrollmentChange called');

    const selectValue = document.getElementById('enrollmentSelect').value;
    console.log('📋 Selected value from dropdown:', selectValue);

    selectedEnrollment = enrollments.find(e => e.id == selectValue);
    console.log('🎯 Found enrollment:', selectedEnrollment);
    if (selectedEnrollment) {
        window.selectedEnrollmentId = selectedEnrollment.id;
        console.log('💾 Stored selected enrollment ID:', window.selectedEnrollmentId);
    }

    const statusDiv = document.getElementById('semesterStatus');
    const statusText = document.getElementById('semesterStatusText');

    if (selectedEnrollment) {
        console.log(`📚 Selected enrollment details:`, {
            id: selectedEnrollment.id,
            displayName: selectedEnrollment.displayName,
            niveauId: selectedEnrollment.niveauId,
            anneeAcademiqueCode: selectedEnrollment.anneeAcademiqueCode
        });

        console.log(`🎯 About to load semesters for niveauId: ${selectedEnrollment.niveauId}`);
        if (statusDiv && statusText) {
            statusDiv.className = 'semester-status loading';
            statusDiv.classList.remove('hidden');
            statusText.textContent = 'Loading semesters...';
            console.log('📱 Updated UI to show loading status');
        } else {
            console.warn('⚠️ Status elements not found in DOM');
        }
        try {
            console.log(`🌐 Making API call to: /infos/niveau/${selectedEnrollment.niveauId}/periodes`);
            const rawSemesters = await progresApiCall(`/infos/niveau/${selectedEnrollment.niveauId}/periodes`);

            console.log('📊 Raw semesters response:', rawSemesters);
            console.log('📊 Semesters type:', typeof rawSemesters);
            console.log('📊 Is array:', Array.isArray(rawSemesters));
            console.log('📊 Semesters length:', rawSemesters ? rawSemesters.length : 'null/undefined');

            let mappedSemesters = [];

            if (rawSemesters && rawSemesters.length > 0) {
                console.log('📊 First semester details:', rawSemesters[0]);
                mappedSemesters = rawSemesters.map((semester, index) => {
                    const mappedSemester = {
                        id: semester.id,
                        llPeriode: semester.libelleLongLt,
                        codePeriode: semester.code, 
                        libelleLongAr: semester.libelleLongAr,
                        libelleLongLt: semester.libelleLongLt,
                        code: semester.code,
                        rang: semester.rang,
                        _original: semester 
                    };

                    console.log(`📊 Semester ${index + 1} mapped:`, {
                        id: mappedSemester.id,
                        llPeriode: mappedSemester.llPeriode,
                        codePeriode: mappedSemester.codePeriode
                    });

                    return mappedSemester;
                });
            }
            window.currentSemesters = mappedSemesters;
            console.log('💾 Stored semesters globally as window.currentSemesters');
            console.log('💾 Verification - window.currentSemesters:', window.currentSemesters);

            console.log(`✅ Successfully loaded ${mappedSemesters.length} semesters for ${selectedEnrollment.displayName}`);
            if (statusDiv && statusText) {
                statusDiv.className = 'semester-status success';
                statusText.textContent = `✅ ${mappedSemesters.length} semesters loaded - You can now view grades and schedule`;
                console.log('📱 Updated UI to show success status');

                setTimeout(() => {
                    statusDiv.classList.add('hidden');
                }, 3000);
            }
            updateMenuButtonsState(true);
            console.log('🔓 Enabled menu buttons');

        } catch (error) {
            console.error('❌ Error loading semesters:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack
            });

            window.currentSemesters = [];
            console.log('💾 Cleared window.currentSemesters due to error');
            if (statusDiv && statusText) {
                statusDiv.className = 'semester-status error';
                statusText.textContent = '❌ Failed to load semesters';
                console.log('📱 Updated UI to show error status');
            }

            updateMenuButtonsState(false);
            console.log('🔒 Disabled menu buttons due to error');
        }
    } else {
        console.log('❌ No enrollment selected or found');
        window.currentSemesters = [];
        console.log('💾 Cleared window.currentSemesters - no enrollment');

        if (statusDiv) {
            statusDiv.classList.add('hidden');
            console.log('📱 Hidden status div');
        }
        updateMenuButtonsState(false);
        console.log('🔒 Disabled menu buttons - no enrollment');
    }

    console.log('🏁 handleEnrollmentChange completed');
}
function updateMenuButtonsState(semestersLoaded) {
    const menuButtons = ['gradesBtn', 'scheduleBtn', 'bilanBtn'];

    menuButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            if (semestersLoaded) {
                button.style.opacity = '1';
                button.style.pointerEvents = 'auto';
                button.title = '';
            } else {
                button.style.opacity = '0.5';
                button.style.pointerEvents = 'none';
                button.title = 'Please select an academic year first';
            }
        }
    });
}
function showContent(title, content) {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.add('hidden');
    contentScreen.classList.remove('hidden');

    document.getElementById('contentTitle').textContent = title;
    if (window.innerWidth < 768) {
        const pageIndex = getPageIndex(title);
        if (!document.querySelector('.swipeable-content')) {
            initializeSwipeableLayout();
        }
        updatePageContent(pageIndex, title, content);
        currentPageIndex = pageIndex;
        updateContentPage();
        updateSwipeIndicators();
    } else {
        document.getElementById('contentBody').innerHTML = content;
    }
}

function getPageIndex(title) {
    const titleMap = {
        ' Assessments & Exams': 0,
        'Schedule': 1,
        'Semester Summary': 2,
        'Student Info': 3,
        'Groups': 4,
        'Yearly GPA': 5
    };
    return titleMap[title] || 0;
}

function initializeSwipeableLayout() {
    const contentBody = document.getElementById('contentBody');
    contentBody.innerHTML = `
        <div class="swipeable-content">
            <div class="content-pages">
                <div class="content-page" id="page-0"><div class="loading-content">Select a semester to view grades.</div></div>
                <div class="content-page" id="page-1"><div class="loading-content">Select a semester to view schedule.</div></div>
                <div class="content-page" id="page-2"><div class="loading-content">Select a semester to view summary.</div></div>
                <div class="content-page" id="page-3"><div class="loading-content">Loading student information...</div></div>
                <div class="content-page" id="page-4"><div class="loading-content">Loading groups...</div></div>
                <div class="content-page" id="page-5"><div class="loading-content">Loading yearly GPA...</div></div>
            </div>
        </div>
    `;
    setTimeout(() => {
        initializeSwipeableContent();
    }, 100);
}

function updatePageContent(pageIndex, title, content) {
    const page = document.getElementById(`page-${pageIndex}`);
    if (page) {
        page.innerHTML = content;
    }
}
function showLoading(show) {
    if (show) {
        loginLoading.classList.remove('hidden');
        document.getElementById('loginBtn').disabled = true;
    } else {
        loginLoading.classList.add('hidden');
        document.getElementById('loginBtn').disabled = false;
    }
}

function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
}

function hideError() {
    loginError.classList.add('hidden');
}
async function progresApiCall(endpoint, params = {}) {
    try {
        if (!endpoint) {
            throw new Error('Endpoint is required');
        }
        if (!endpoint.startsWith('/')) {
            endpoint = '/' + endpoint;
        }
        const baseUrl = PROGRESS_API_BASE.endsWith('/') ? PROGRESS_API_BASE.slice(0, -1) : PROGRESS_API_BASE;
        const fullUrl = `${baseUrl}${endpoint}`;
        if (!fullUrl.startsWith('https://')) {
            console.error('❌ Invalid URL construction:', { baseUrl, endpoint, fullUrl });
            throw new Error(`Invalid URL: ${fullUrl}`);
        }

        console.log(`🌐 API Call: ${fullUrl}`);

        const url = new URL(fullUrl);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        console.log(`🌐 API Call: ${fullUrl}${Object.keys(params).length ? ' with params' : ''}`);
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': authToken,
                'Accept': 'application/json',
                'User-Agent': 'progres-Algeria-Extension/1.0'
            },
            mode: 'cors'
        }).catch(error => {
            console.error(`❌ Network error for ${fullUrl}:`, error);
            throw new Error(`Network error: ${error.message}`);
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`❌ API call failed for ${fullUrl}: API Error ${response.status}: ${response.statusText} - ${errorText}`);
            throw new Error(`API Error ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`✅ API Success: ${endpoint} returned ${Array.isArray(data) ? data.length + ' items' : 'data'}`);
        return data;

    } catch (error) {
        console.error(`❌ API call failed for ${endpoint}:`, error.message);
        if (error.message.includes('401') || error.message.includes('403')) {
            console.warn('🔐 Authentication may have expired, consider re-login');
        }

        throw error;
    }
}
function showContentLoading(title) {
    showContent(title, '<div class="loading-content">Loading...</div>');
}
function showContentError(title, error) {
    const errorMessage = error.message || 'An error occurred while loading data.';
    showContent(title, `<div class="error-content">
        <p>❌ ${errorMessage}</p>
        <button onclick="showDashboard()" class="retry-btn">Back to Dashboard</button>
    </div>`);
}
async function showStudentInfo() {
    if (!selectedEnrollment) {
        alert('Please select an academic year first');
        return;
    }

    showContentLoading('Student Information');

    try {
        const data = await progresApiCall(`/infos/bac/${currentUser.uuid}/dias`);
        const studentData = data[0]; 

        const content = `
            <div class="student-info">
                <h3>Personal Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>First Name:</strong> ${studentData.individuPrenomLatin || 'N/A'}
                    </div>
                    <div class="info-item">
                        <strong>Last Name:</strong> ${studentData.individuNomLatin || 'N/A'}
                    </div>
                    <div class="info-item">
                        <strong>Date of Birth:</strong> ${studentData.individuDateNaissance || 'N/A'}
                    </div>
                    <div class="info-item">
                        <strong>Place of Birth:</strong> ${studentData.individuLieuNaissance || 'N/A'}
                    </div>
                    <div class="info-item">
                        <strong>Student ID:</strong> ${currentUser.idIndividu || 'N/A'}
                    </div>
                    <div class="info-item">
                        <strong>Institution:</strong> ${studentData.llEtablissementLatin || 'N/A'}
                    </div>
                </div>
            </div>
        `;

        showContent('Student Information', content);
    } catch (error) {
        showContentError('Student Information', error);
    }
}

async function showGrades() {
    console.log('🎯 showGrades called');
    console.log('🎯 selectedEnrollment:', selectedEnrollment);
    console.log('🎯 window.currentSemesters:', window.currentSemesters);
    console.log('🎯 window.currentSemesters type:', typeof window.currentSemesters);
    console.log('🎯 window.currentSemesters is array:', Array.isArray(window.currentSemesters));

    if (!selectedEnrollment) {
        console.log('❌ No enrollment selected');
        alert('Please select an academic year first');
        return;
    }

    if (!window.currentSemesters || window.currentSemesters.length === 0) {
        console.log('❌ No semesters available');
        console.log('❌ window.currentSemesters:', window.currentSemesters);
        alert('No semesters loaded. Please select an academic year first.');
        return;
    }

    showContentLoading(' Assessments & Exams');

    try {
        const semesters = window.currentSemesters;
        console.log(`📚 Using pre-loaded semesters:`, semesters);
        console.log(`📚 Semesters count: ${semesters.length}`);

        let content = '<div class="grades-container">';
        content += '<div class="semester-selector-container">';
        content += '<label for="semesterSelect">Select Semester:</label>';
        content += '<select id="semesterSelect">';
        content += '<option value="">Choose a semester...</option>';

        semesters.forEach((semester, index) => {
            console.log(`📚 Processing semester ${index}:`, semester);
            const semesterName = semester.llPeriode || semester.libelleLongLt || `Semester ${semester.id}`;
            content += `<option value="${semester.id}" data-name="${semesterName}">${semesterName}</option>`;
        });

        content += '</select></div>';
        content += '<div id="gradesContent">Please select a semester to view grades.</div>';
        content += '</div>';

        console.log('📚 Generated content for grades view');
        showContent(' Assessments & Exams', content);
        window.currentEnrollment = selectedEnrollment;
        console.log('💾 Stored currentEnrollment:', window.currentEnrollment);
        setTimeout(() => {
            const semesterSelect = document.getElementById('semesterSelect');
            if (semesterSelect) {
                semesterSelect.addEventListener('change', loadGradesForSemester);
                console.log('📚 Added event listener for semester selection');
            }
        }, 100);

    } catch (error) {
        console.error('❌ Error in showGrades:', error);
        showContentError(' Assessments & Exams', error);
    }
}
async function loadGradesForSemester() {
    const semesterSelect = document.getElementById('semesterSelect');
    const gradesContent = document.getElementById('gradesContent');
    const selectedSemesterId = semesterSelect.value;
    const selectedSemesterName = semesterSelect.options[semesterSelect.selectedIndex].dataset.name;

    if (!selectedSemesterId) {
        gradesContent.innerHTML = 'Please select a semester to view grades.';
        return;
    }

    gradesContent.innerHTML = '<div class="loading-content">Loading grades...</div>';

    try {
        let semesterContent = `<div class="semester-section">
            <h3>${selectedSemesterName}</h3>`;
        try {
            console.log(`📊 Loading notes for semester: ${selectedSemesterName}`);
            const allNotes = await progresApiCall(`/infos/controleContinue/dia/${window.currentEnrollment.id}/notesCC`);
            console.log('📊 All notes response:', allNotes);
            const notes = allNotes.filter(note => note.llPeriode === selectedSemesterName);
            console.log(`📊 Filtered notes for ${selectedSemesterName}:`, notes);

            if (notes && notes.length > 0) {
                semesterContent += '<h4>Continuous Assessment</h4>';
                semesterContent += '<div class="notes-table"><table><thead><tr><th>Subject</th><th>Note</th><th>Type</th></tr></thead><tbody>';
                notes.forEach(note => {
                    console.log('📊 Processing note:', {
                        subject: note.rattachementMcMcLibelleFr,
                        note: note.note,
                        type: note.apCode
                    });

                    const subjectName = note.rattachementMcMcLibelleFr || note.rattachementMcMcLibelleAr || note.mcLibelleFr || note.mcLibelleAr || 'Unknown Subject';
                    const noteValue = note.note !== null && note.note !== undefined ? note.note : 'N/A';
                    const assessmentType = note.apCode || 'N/A';
                    const gradeClass = getGradeClass(noteValue);
                    const formattedNote = noteValue !== 'N/A' ? `<span class="grade-value ${gradeClass}">${noteValue}</span>` : 'N/A';
                    const formattedType = `<span class="class-type ${assessmentType}">${assessmentType}</span>`;

                    semesterContent += `<tr>
                        <td>${subjectName}</td>
                        <td>${formattedNote}</td>
                        <td>${formattedType}</td>
                    </tr>`;
                });
                semesterContent += '</tbody></table></div>';
            } else {
                semesterContent += '<p>No continuous assessment notes available for this semester.</p>';
            }
        } catch (error) {
            console.error('❌ Error loading continuous assessment:', error);
            semesterContent += '<p>Error loading continuous assessment for this semester.</p>';
        }
        try {
            console.log(`📊 Loading exams for semester ID: ${selectedSemesterId}`);
            const allExams = await progresApiCall(`/infos/planningSession/dia/${window.currentEnrollment.id}/noteExamens`);
            console.log('📊 All exams response:', allExams);
            const exams = allExams.filter(exam => exam.idPeriode == selectedSemesterId);
            console.log(`📊 Filtered exams for semester ID ${selectedSemesterId}:`, exams);

            if (exams && exams.length > 0) {
                semesterContent += '<h4>Exam Results</h4>';
                semesterContent += '<div class="notes-table"><table><thead><tr><th>Subject</th><th>Exam Note</th><th>Coefficient</th></tr></thead><tbody>';
                exams.forEach(exam => {
                    console.log('📊 Processing exam:', {
                        subject: exam.mcLibelleFr,
                        note: exam.noteExamen,
                        coefficient: exam.rattachementMcCoefficient
                    });

                    const subjectName = exam.mcLibelleFr || exam.mcLibelleAr || exam.mcLibelleLt || exam.libelleMc || exam.nomMc || 'Unknown Subject';
                    const noteValue = exam.noteExamen !== null && exam.noteExamen !== undefined ? exam.noteExamen : 'N/A';
                    const coefficient = exam.rattachementMcCoefficient || exam.coefficient || exam.coeff || exam.coefficientMc || 'N/A';
                    const gradeClass = getGradeClass(noteValue);
                    const formattedNote = noteValue !== 'N/A' ? `<span class="grade-value ${gradeClass}">${noteValue}</span>` : '<span class="grade-value na">N/A</span>';

                    semesterContent += `<tr>
                        <td>${subjectName}</td>
                        <td>${formattedNote}</td>
                        <td>${coefficient}</td>
                    </tr>`;
                });
                semesterContent += '</tbody></table></div>';
            } else {
                semesterContent += '<p>No exam results available for this semester.</p>';
            }
        } catch (error) {
            console.error('❌ Error loading exam results:', error);
            semesterContent += '<p>Error loading exam results for this semester.</p>';
        }

        semesterContent += '</div>';
        gradesContent.innerHTML = semesterContent;

    } catch (error) {
        console.error('Error loading semester grades:', error);
        gradesContent.innerHTML = '<div class="error-content">Error loading grades for this semester.</div>';
    }
}

async function showSchedule() {
    if (!selectedEnrollment) {
        alert('Please select an academic year first');
        return;
    }

    if (!window.currentSemesters || window.currentSemesters.length === 0) {
        alert('No semesters loaded. Please select an academic year first.');
        return;
    }

    showContentLoading('Schedule');

    try {
        const semesters = window.currentSemesters;
        console.log(`📅 Using pre-loaded ${semesters.length} semesters for schedule`);

        let content = '<div class="schedule-container">';
        content += '<div class="semester-selector-container">';
        content += '<label for="scheduleSemseterSelect">Select Semester:</label>';
        content += '<select id="scheduleSemseterSelect">';
        content += '<option value="">Choose a semester...</option>';

        semesters.forEach(semester => {
            const semesterName = semester.llPeriode || semester.libelleLongLt || `Semester ${semester.id}`;
            content += `<option value="${semester.id}" data-name="${semesterName}">${semesterName}</option>`;
        });

        content += '</select></div>';
        content += '<div id="scheduleContent">Please select a semester to view schedule.</div>';
        content += '</div>';

        showContent('Schedule', content);
        window.currentScheduleEnrollment = selectedEnrollment;
        setTimeout(() => {
            const scheduleSelect = document.getElementById('scheduleSemseterSelect');
            if (scheduleSelect) {
                scheduleSelect.addEventListener('change', loadScheduleForSemester);
                console.log('📅 Added event listener for schedule semester selection');
            }
        }, 100);

    } catch (error) {
        showContentError('Schedule', error);
    }
}
async function loadScheduleForSemester() {
    const semesterSelect = document.getElementById('scheduleSemseterSelect');
    const scheduleContent = document.getElementById('scheduleContent');
    const selectedSemesterId = semesterSelect.value;
    const selectedSemesterName = semesterSelect.options[semesterSelect.selectedIndex].dataset.name;

    if (!selectedSemesterId) {
        scheduleContent.innerHTML = 'Please select a semester to view schedule.';
        return;
    }

    scheduleContent.innerHTML = '<div class="loading-content">Loading schedule...</div>';

    try {
        console.log(`📅 Loading schedule for semester: ${selectedSemesterName} (ID: ${selectedSemesterId})`);
        console.log(`📅 Enrollment ID: ${window.currentScheduleEnrollment.id}`);
        const allSessions = await progresApiCall(`/infos/seanceEmploi/inscription/${window.currentScheduleEnrollment.id}`);

        console.log('📅 All sessions response:', allSessions);
        console.log('📅 Sessions type:', typeof allSessions);
        console.log('📅 Is array:', Array.isArray(allSessions));
        console.log('📅 Sessions length:', allSessions ? allSessions.length : 'null/undefined');

        if (allSessions && allSessions.length > 0) {
            console.log('📅 First session sample:', allSessions[0]);
            console.log('📅 Session object keys:', Object.keys(allSessions[0]));
        }
        const filteredSessions = allSessions.filter(session => {
            console.log(`📅 Checking session periodeId ${session.periodeId} against ${selectedSemesterId}`);
            return session.periodeId == selectedSemesterId;
        });

        console.log(`📅 Filtered sessions for semester ID ${selectedSemesterId}:`, filteredSessions);

        let content = `<h3>Schedule for ${selectedSemesterName}</h3>`;

        if (filteredSessions && filteredSessions.length > 0) {
            const groupedSchedule = filteredSessions.reduce((acc, session) => {
                const day = session.jourLibelleFr || session.jourLibelleAr;
                if (!acc[day]) {
                    acc[day] = [];
                }
                acc[day].push(session);
                return acc;
            }, {});
            const dayOrder = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const sortedDays = Object.keys(groupedSchedule).sort((a, b) => {
                return dayOrder.indexOf(a) - dayOrder.indexOf(b);
            });

            sortedDays.forEach(day => {
                content += `<div class="day-schedule">
                    <h4>${day}</h4>
                    <div class="sessions">`;
                groupedSchedule[day].sort((a, b) => {
                    const timeA = (a.plageHoraireHeureDebut || '00:00').toString();
                    const timeB = (b.plageHoraireHeureDebut || '00:00').toString();
                    return timeA.localeCompare(timeB);
                });

                groupedSchedule[day].forEach(session => {
                    const startTime = session.plageHoraireHeureDebut || 'N/A';
                    const endTime = session.plageHoraireHeureFin || 'N/A';
                    const subject = session.matiere || session.matiereAr || 'N/A';
                    const room = session.refLieuDesignation || 'N/A';
                    const type = session.ap || 'N/A';

                    content += `<div class="session">
                        <div class="time-slot">${startTime} - ${endTime}</div>
                        <div class="subject-name">${subject}</div>
                        <div class="room-info">${room}</div>
                        <div class="class-type ${type}">${type}</div>
                    </div>`;
                });

                content += '</div></div>';
            });
            content += createUniversityTimetable(filteredSessions);
        } else {
            content += '<p>No schedule data available for this semester.</p>';
        }

        scheduleContent.innerHTML = content;

    } catch (error) {
        console.error('Error loading semester schedule:', error);
        scheduleContent.innerHTML = '<div class="error-content">Error loading schedule for this semester.</div>';
    }
}

async function showBilan() {
    if (!selectedEnrollment) {
        alert('Please select an academic year first');
        return;
    }

    if (!window.currentSemesters || window.currentSemesters.length === 0) {
        alert('No semesters loaded. Please select an academic year first.');
        return;
    }

    showContentLoading('Semester Summary');

    try {
         const semesters = window.currentSemesters;
        console.log(`📊 Using pre-loaded ${semesters.length} semesters for bilan`);

        let content = '<div class="bilan-container">';

        for (const semester of semesters) {
            content += `<div class="semester-bilan">
                <h3>${semester.llPeriode}</h3>`;

            try {
                const allBilans = await progresApiCall(`/infos/bac/ ${currentUser.uuid}/dias/${selectedEnrollment.id}/periode/bilans`);

                 const semesterName = semester.llPeriode || semester.libelleLongLt;
                const semesterData = allBilans.find(
                    (bilan) => bilan.periodeLibelleFr === semesterName
                );

                if (semesterData) {
                     const averageClass = getGradeClass(semesterData.moyenne);
                    const averageColorClass = averageClass !== 'na' ? `gpa-${averageClass}` : 'gpa-average';

                    content += `<div class="module-summary">
                        <div class="module-summary-header">
                            <div class="summary-stat">
                                <span class="stat-label">Average:</span>
                                <div class="stat-value ${averageColorClass}">${semesterData.moyenne || 'N/A'}</div>
                            </div>
                            <div class="summary-stat">
                                <span class="stat-label">Credits Acquired:</span>
                                <div class="stat-value credits-value">${semesterData.creditAcquis || 'N/A'}</div>
                            </div>
                        </div>
                    </div>`;

                    const semesterCode = semester.codePeriode || semester.code;
                    const modules = allBilans
                        .flatMap((bilan) =>
                            bilan.bilanUes.flatMap((ue) =>
                                ue.bilanMcs
                                    .filter((mc) => semesterCode && ue.ueLibelleAr.slice(-2) === semesterCode)
                                    .map((mc) => ({
                                        mcLibelleFr: mc.mcLibelleFr,
                                        moyenneGenerale: mc.moyenneGenerale,
                                        coefficient: mc.coefficient,
                                        ueLibelleAr: ue.ueLibelleAr,
                                    }))
                            )
                        );

                    if (modules && modules.length > 0) {
                        content += '<div class="notes-table"><table><thead><tr><th>Module</th><th>Average</th><th>Coefficient</th></tr></thead><tbody>';
                        modules.forEach(module => {
                             const gradeClass = getGradeClass(module.moyenneGenerale);
                            const formattedAverage = module.moyenneGenerale !== null && module.moyenneGenerale !== undefined ?
                                `<span class="grade-value ${gradeClass}">${module.moyenneGenerale}</span>` :
                                '<span class="grade-value na">N/A</span>';

                            content += `<tr>
                                <td>${module.mcLibelleFr}</td>
                                <td>${formattedAverage}</td>
                                <td>${module.coefficient || 'N/A'}</td>
                            </tr>`;
                        });
                        content += '</tbody></table></div>';
                    }
                } else {
                    content += '<p>No bilan data available for this semester.</p>';
                }
            } catch (error) {
                content += '<p>Error loading bilan for this semester.</p>';
            }

            content += '</div>';
        }

        content += '</div>';
        showContent('Semester Summary', content);
    } catch (error) {
        showContentError('Semester Summary', error);
    }
}

async function showGroups() {
    if (!selectedEnrollment) {
        alert('Please select an academic year first');
        return;
    }

    showContentLoading('Groups');

    try {
        const groupsData = await progresApiCall(`/infos/dia/${selectedEnrollment.id}/groups`);

        let content = '<div class="groups-container">';

        if (groupsData && groupsData.length > 0) {
            content += '<div class="groups-table"><table><thead><tr><th>Semester</th><th>Section</th><th>Group</th></tr></thead><tbody>';
            groupsData.forEach(group => {
                content += `<tr>
                    <td>${group.periodeLibelleLongLt || 'N/A'}</td>
                    <td>${group.nomSection || 'N/A'}</td>
                    <td>${group.nomGroupePedagogique || 'N/A'}</td>
                </tr>`;
            });
            content += '</tbody></table></div>';
        } else {
            content += '<p>No groups information available.</p>';
        }

        content += '</div>';
        showContent('Groups', content);
    } catch (error) {
        showContentError('Groups', error);
    }
}

async function showYearlyBilan() {
    if (!selectedEnrollment) {
        alert('Please select an academic year first');
        return;
    }

    showContentLoading('Yearly GPA');

    try {
        console.log(`🎓 Loading yearly bilan for enrollment ${selectedEnrollment.id}`);
        const yearlyBilanData = await progresApiCall(`/infos/bac/${currentUser.uuid}/dia/${selectedEnrollment.id}/annuel/bilan`);
        console.log('🎓 Yearly bilan response:', yearlyBilanData);

        let content = '<div class="yearly-bilan-container">';

        if (yearlyBilanData && yearlyBilanData.length > 0) {
            const yearlyBilan = yearlyBilanData[0]; 
            console.log('🎓 Processing yearly bilan:', yearlyBilan);

            const gpa = yearlyBilan.moyenne || yearlyBilan.moyenneGeneraleAnnuelle || yearlyBilan.moyenneAnnuelle || 'N/A';
            const acquiredCredits = yearlyBilan.creditAcquis || yearlyBilan.creditsAcquis || yearlyBilan.creditsObtenus || 'N/A';

              const gpaClass = getGradeClass(gpa);
            const gpaColorClass = gpaClass !== 'na' ? `gpa-${gpaClass}` : 'gpa-average';

            content += `<div class="yearly-summary">
                <h3>Yearly Academic Summary</h3>
                <div class="summary-grid">
                    <div class="summary-item">
                        <strong>Overall GPA</strong>
                        <div class="value gpa-value ${gpaColorClass}">${gpa}</div>
                    </div>
                    <div class="summary-item">
                        <strong>Credits Acquired</strong>
                        <div class="value credits-value">${acquiredCredits}</div>
                    </div>
                </div>
            </div>`;
        } else {
            content += '<p>No yearly bilan data available.</p>';
        }

        content += '</div>';
        showContent('Yearly GPA', content);
    } catch (error) {
        showContentError('Yearly GPA', error);
    }
}
async function getModuleSummary(semesterId, semesterName) {
    try {
        console.log(`📊 Loading module summary for semester: ${semesterName} (ID: ${semesterId})`);

        const bilanData = await progresApiCall(`/infos/bac/${currentUser.uuid}/dia/${window.currentEnrollment.id}/bilan`);
        console.log('📊 Bilan data response:', bilanData);

        if (!bilanData || bilanData.length === 0) {
            return { modules: [], semesterAverage: 'N/A', credits: 'N/A' };
        }

       const semesterData = bilanData.find(bilan =>
            bilan.periodeLibelleFr === semesterName ||
            bilan.periodeId == semesterId
        );

        if (!semesterData) {
            console.log('📊 No semester data found in bilan');
            return { modules: [], semesterAverage: 'N/A', credits: 'N/A' };
        }

        console.log('📊 Found semester data:', semesterData);

        const modules = [];
        if (semesterData.bilanUes) {
            semesterData.bilanUes.forEach(ue => {
                if (ue.bilanMcs) {
                    ue.bilanMcs.forEach(mc => {
                        modules.push({
                            name: mc.mcLibelleFr || mc.mcLibelleAr || 'Unknown Module',
                            average: mc.moyenneGenerale || 'N/A',
                            coefficient: mc.coefficient || ue.coefficient || 'N/A'
                        });
                    });
                }
            });
        }

        return {
            modules: modules,
            semesterAverage: semesterData.moyenneGenerale || 'N/A',
            credits: semesterData.creditsAcquis || semesterData.creditAcquis || 30
        };

    } catch (error) {
        console.error('❌ Error loading module summary:', error);
        return { modules: [], semesterAverage: 'N/A', credits: 'N/A' };
    }
}
function createModuleSummaryHtml(semesterName, moduleData) {
    const averageClass = getGradeClass(moduleData.semesterAverage);
    const averageColorClass = averageClass !== 'na' ? `gpa-${averageClass}` : 'gpa-average';

    let html = `<div class="semester-section">
        <h3>${semesterName}</h3>

        <div class="module-summary">
            <div class="module-summary-header">
                <div class="summary-stat">
                    <span class="stat-label">Average:</span>
                    <div class="stat-value ${averageColorClass}">${moduleData.semesterAverage}</div>
                </div>
                <div class="summary-stat">
                    <span class="stat-label">Credits Acquired:</span>
                    <div class="stat-value credits-value">${moduleData.credits}</div>
                </div>
            </div>
        </div>`;

    if (moduleData.modules && moduleData.modules.length > 0) {
        html += `<div class="notes-table">
            <table>
                <thead>
                    <tr>
                        <th>Module</th>
                        <th>Average</th>
                        <th>Coefficient</th>
                    </tr>
                </thead>
                <tbody>`;

        moduleData.modules.forEach(module => {
            const gradeClass = getGradeClass(module.average);
            const formattedAverage = module.average !== 'N/A' ?
                `<span class="grade-value ${gradeClass}">${module.average}</span>` :
                '<span class="grade-value na">N/A</span>';

            html += `<tr>
                <td>${module.name}</td>
                <td>${formattedAverage}</td>
                <td>${module.coefficient}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    } else {
        html += '<p>No module data available for this semester.</p>';
    }

    html += '</div>';
    return html;
}
let currentPageIndex = 0;
const pages = ['grades', 'schedule', 'bilan', 'studentInfo', 'groups', 'yearlyBilan'];
let startX = 0;
let currentX = 0;
let isDragging = false;

function initializeSwipeableContent() {
     if (window.innerWidth >= 768) return;

    const contentBody = document.querySelector('.content-body');
    if (!contentBody) return;

    contentBody.addEventListener('touchstart', handleTouchStart, { passive: false });
    contentBody.addEventListener('touchmove', handleTouchMove, { passive: false });
    contentBody.addEventListener('touchend', handleTouchEnd, { passive: false });

     addSwipeIndicators();
}

function handleTouchStart(e) {
    if (window.innerWidth >= 768) return;

    startX = e.touches[0].clientX;
    isDragging = true;

    const contentPages = document.querySelector('.content-pages');
    if (contentPages) {
        contentPages.style.transition = 'none';
    }
}

function handleTouchMove(e) {
    if (!isDragging || window.innerWidth >= 768) return;

    e.preventDefault();
    currentX = e.touches[0].clientX;
    const diffX = currentX - startX;

    const contentPages = document.querySelector('.content-pages');
    if (contentPages) {
        const translateX = -(currentPageIndex * (100 / pages.length)) + (diffX / window.innerWidth * 100 / pages.length);
        contentPages.style.transform = `translateX(${translateX}%)`;
    }
}

function handleTouchEnd(e) {
    if (!isDragging || window.innerWidth >= 768) return;

    isDragging = false;
    const diffX = currentX - startX;
    const threshold = window.innerWidth * 0.2; 

    if (Math.abs(diffX) > threshold) {
        if (diffX > 0 && currentPageIndex > 0) {
            currentPageIndex--;
        } else if (diffX < 0 && currentPageIndex < pages.length - 1) {
              currentPageIndex++;
        }
    }

    updateContentPage();
    updateSwipeIndicators();
}

function updateContentPage() {
    const contentPages = document.querySelector('.content-pages');
    if (contentPages) {
        contentPages.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        contentPages.style.transform = `translateX(-${currentPageIndex * (100 / pages.length)}%)`;
    }
}

function addSwipeIndicators() {
    const dashboard = document.querySelector('.dashboard');
    if (!dashboard) return;

    const indicatorsHtml = `
        <div class="swipe-indicators">
            ${pages.map((_, index) => `<div class="swipe-dot ${index === 0 ? 'active' : ''}" data-page="${index}"></div>`).join('')}
        </div>
        <div class="swipe-hint">← Swipe to navigate between pages →</div>
    `;

    dashboard.insertAdjacentHTML('beforeend', indicatorsHtml);

      document.querySelectorAll('.swipe-dot').forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentPageIndex = index;
            updateContentPage();
            updateSwipeIndicators();
        });
    });
}

function updateSwipeIndicators() {
    document.querySelectorAll('.swipe-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentPageIndex);
    });
}
async function loadSemesterSummary() {
    const summarySelect = document.getElementById('summarySelect');
    const summaryContent = document.getElementById('summaryContent');
    const selectedSemesterId = summarySelect.value;
    const selectedSemesterName = summarySelect.options[summarySelect.selectedIndex].dataset.name;

    if (!selectedSemesterId) {
        summaryContent.innerHTML = 'Please select a semester to view summary.';
        return;
    }

    summaryContent.innerHTML = '<div class="loading-content">Loading semester summary...</div>';

    try {
        const moduleData = await getModuleSummary(selectedSemesterId, selectedSemesterName);
        const summaryHtml = createModuleSummaryHtml(selectedSemesterName, moduleData);
        summaryContent.innerHTML = summaryHtml;
    } catch (error) {
        console.error('❌ Error loading semester summary:', error);
        summaryContent.innerHTML = `<div class="semester-section">
            <h3>${selectedSemesterName}</h3>
            <p>Error loading semester summary.</p>
        </div>`;
    }
}
