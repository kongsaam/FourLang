// [1] 전역 변수 설정
let sentences = [];   // masterdata.json의 sentences 데이터를 저장
let dictionary = {};  // masterdata.json의 dictionary 데이터를 저장
let idx = 0;          // 현재 문장 번호 (0부터 시작)
var noSleep = new NoSleep();
var silenceAudio = new Audio("https://raw.githubusercontent.com/anars/blank-audio/master/10-seconds-of-silence.mp3");
silenceAudio.loop = true;

var lang = 'en', run = false, t1, t2;
var isRepeatOne = false;
var totalCount = 0;
var lastLevels = { en: "", cn: "", jp: "", es: "" };

let isCategorySyncing = false;
let isStarMode = false;

// [모달 스와이프 로직]
let touchStartY = 0;
let touchEndY = 0;
const modalEl = document.getElementById('word-modal');
if (modalEl) {
    modalEl.addEventListener('touchstart', e => touchStartY = e.touches[0].clientY, { passive: true });
    modalEl.addEventListener('touchend', e => {
        touchEndY = e.changedTouches[0].clientY;
        if (touchEndY - touchStartY > 50) closeModal();
    }, { passive: true });
}

// [2] 데이터 불러오기 함수
async function loadData() {
    try {
        const response = await fetch('masterdata.json');
        if (!response.ok) throw new Error(`데이터 파일을 찾을 수 없습니다. (Status: ${response.status})`);

        const data = await response.json();

        // JSON 구조에 맞춰 변수에 할당
        sentences = data.sentences || [];
        dictionary = data.dictionary || {};

        console.log("✅ 데이터 로드 성공! 총 문장 개수:", sentences.length);

        // 데이터 로드 후 앱 초기화 실행
        initApp();

    } catch (error) {
        console.error("❌ 데이터 로드 오류:", error);
        const container = document.getElementById('mainContainer');
        if (container) {
            container.innerHTML = `<div style="color: red; padding: 20px;">데이터 로드 실패: ${error.message}</div>`;
        }
    }
}

// [3] 앱 초기화 루틴
function initApp() {
    const savedLang = localStorage.getItem('lastLang') || 'en';
    const savedIdx = localStorage.getItem(`lastIdx_${savedLang}`);

    idx = savedIdx ? parseInt(savedIdx) : 0;
    totalCount = sentences.length;

    updateStreak();   // 스트릭 업데이트
    initCategory();   // 카테고리 셀렉트박스 생성

    setTimeout(() => {
        setLang(savedLang); // 저장된 언어로 시작
    }, 50);
}

// [4] 카테고리 관련 함수
function initCategory() {
    var select = document.getElementById('catSelect');
    if (!select) return;
    var cats = [...new Set(sentences.map(d => d.cat))];
    select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function jumpToCategory(e) {
    if (isCategorySyncing) return;
    var foundIdx = sentences.findIndex(d => d.cat === e.target.value);
    if (foundIdx !== -1) {
        idx = foundIdx;
        update();
        if (run) { resetTimer(); loop(); }
    }
}

function syncCategoryByIndex(data) {
    if (!data) return;
    const catSelect = document.getElementById("catSelect");
    if (!catSelect) return;
    if (catSelect.value !== data.cat) {
        isCategorySyncing = true;
        catSelect.value = data.cat;
        isCategorySyncing = false;
    }
}

// [5] 인덱스 직접 입력 기능
function showIdxInput(e) {
    e.stopPropagation();
    if (run) toggle();
    const progEl = document.getElementById('prog');
    progEl.innerHTML = `<input type="number" id="idxInput" min="1" max="${totalCount}" value=""> / ${totalCount}`;
    const input = document.getElementById('idxInput');
    input.focus();
    input.onblur = applyIdx;
    input.onkeyup = ev => { if (ev.keyCode === 13) applyIdx(); };
}

function applyIdx() {
    const input = document.getElementById('idxInput');
    if (input) {
        let val = parseInt(input.value);
        if (!isNaN(val)) idx = Math.max(0, Math.min(val - 1, totalCount - 1));
        update();
    }
}

function openHelp() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.add('active');
    document.body.classList.add('modal-open'); // 스크롤 방지용 (선택사항)
}

function closeHelp() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('modal-open');
}

// 배경 클릭 시 닫기 기능 추가 (선택)
window.onclick = function (event) {
    const modal = document.getElementById('help-modal');
    if (event.target == modal) {
        closeHelp();
    }
}

// [6] 핵심 화면 갱신 함수
function update() {
    const starStorageKey = `stars_${lang}`;
    const rawStarList = JSON.parse(localStorage.getItem(starStorageKey) || "[]");
    const starList = rawStarList.map(s => String(s));

    const currentList = isStarMode
        ? sentences.filter(item => item.id && starList.includes(String(item.id)))
        : sentences;

    if (isStarMode && currentList.length === 0) {
        alert("이 언어에 별표 된 문장이 없습니다.");
        isStarMode = false;
        const chk = document.getElementById('starModeCheck');
        if (chk) chk.checked = false;
        update();
        return;
    }

    if (!currentList || currentList.length === 0) return;
    if (idx >= currentList.length) idx = 0;
    if (idx < 0) idx = 0;

    const data = currentList[idx];
    if (!data) return;

    syncCategoryByIndex(data);

    // 문장 표시 (사전 연동)
    const mainEl = document.getElementById('main');
    if (mainEl) mainEl.innerHTML = renderSmartText(data[lang], lang);

    // 발음 표시
    const pronEl = document.getElementById('pron');
    const pronText = data[lang + 'P'] || "";
    if (pronEl) {
        if (['cn', 'jp', 'es'].includes(lang) && pronText) {
            pronEl.innerText = pronText;
            pronEl.style.display = 'block';
        } else {
            pronEl.style.display = 'none';
        }
    }

    // 뜻 표시 초기화
    const koEl = document.getElementById('ko');
    if (koEl) {
        koEl.classList.remove('visible', 'no-transition');
        koEl.innerText = data.ko;
    }

    // 7. ★ 별표 버튼 상태 업데이트 ★
    const starBtn = document.getElementById('star-btn');
    
    if (starBtn && data.id) {
        const starStorageKey = `stars_${lang}`;
        const starList = JSON.parse(localStorage.getItem(starStorageKey) || "[]").map(s => String(s));
        const isStarred = starList.includes(String(data.id));
        starBtn.classList.toggle('active', isStarred);
    }

    // 완료 체크 상태
    const doneList = JSON.parse(localStorage.getItem(`done_${lang}`) || "[]");
    const checkDone = document.getElementById('checkDone');
    const doneLabel = document.getElementById('doneLabel');
    if (checkDone && data.id) {
        const isDone = doneList.includes(String(data.id));
        checkDone.checked = isDone;
        if (doneLabel) isDone ? doneLabel.classList.add('active') : doneLabel.classList.remove('active');
    }

    // 진도표시
    const progEl = document.getElementById('prog');
    totalCount = currentList.length;
    if (progEl) progEl.innerHTML = `<span onclick="showIdxInput(event)" style="cursor:pointer; text-decoration:underline;">${idx + 1}</span> / ${totalCount}`;

    localStorage.setItem(`lastIdx_${lang}`, idx);
    localStorage.setItem('lastLang', lang);

    updateLevel();
}

// [7] 사전 데이터 렌더링
function renderSmartText(text, currentLang) {
    if (!text || !dictionary[currentLang]) return text;
    const dictKeys = Object.keys(dictionary[currentLang]).sort((a, b) => b.length - a.length);
    if (dictKeys.length === 0) return text;
    const pattern = new RegExp(`(${dictKeys.join('|')})`, 'gi');
    return text.replace(pattern, match => `<span class="clickable-word" onclick="handleWordClick('${match}', '${currentLang}'); event.stopPropagation();" style="text-decoration: underline; text-underline-offset: 4px; color: inherit;">${match}</span>`);
}

function handleWordClick(word, targetLang) {
    const cleanWord = word.replace(/[.,!?]/g, "").trim();
    const dict = dictionary[targetLang];
    const searchKey = (targetLang === 'en') ? cleanWord.toLowerCase() : cleanWord;
    const wordData = dict ? (dict[searchKey] || dict[cleanWord]) : null;

    if (wordData) {
        document.getElementById('selected-word-display').innerHTML = `${cleanWord} <span style="font-size: 0.7em; color: #ff4757; font-weight: normal; margin-left: 8px;">[${wordData.pron || ''}]</span>`;
        document.getElementById('word-meaning-display').innerHTML = `<div style="font-size: 1.2rem; font-weight: bold; color: #333; margin-bottom: 12px;">${wordData.mean}</div><div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #78350f; color: #555; font-size: 0.95rem; text-align: left;">"${wordData.ex || ''}"</div>`;
        document.getElementById('word-modal').classList.add('active');
        document.getElementById('modal-overlay').classList.add('active');
        document.body.classList.add('modal-open');
        speakWord(cleanWord, targetLang);
    }
}

// [8] 레벨 시스템
function updateLevel() {
    const storageKey = `done_${lang}`;
    const doneList = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const doneCount = doneList.length;

    if (document.getElementById('done-count-display')) document.getElementById('done-count-display').innerText = `(${doneCount})`;

    let levelName = "Lv.1 콩삼이";
    const levels = [[500, "Lv.10 마스터"], [400, "Lv.9 전설"], [300, "Lv.8 영웅"], [200, "Lv.7 고수"], [150, "Lv.6 전문가"], [100, "Lv.5 숙련자"], [60, "Lv.4 상급자"], [30, "Lv.3 중급자"], [10, "Lv.2 입문자"]];
    for (let [cnt, name] of levels) { if (doneCount >= cnt) { levelName = name; break; } }

    let prevLevelForLang = lastLevels[lang];
    if (prevLevelForLang !== "" && prevLevelForLang !== levelName) {
        const prevNum = parseInt(prevLevelForLang.match(/\d+/));
        const currNum = parseInt(levelName.match(/\d+/));
        if (currNum > prevNum) { playLevelUpSound(); showLevelUpModal(levelName); }
    }
    lastLevels[lang] = levelName;
    if (document.getElementById('lvl')) document.getElementById('lvl').innerText = levelName;
    updateTheme(doneCount);
}

function playLevelUpSound() {
    const audio = document.getElementById('levelUpSound');
    if (audio) { audio.currentTime = 0; audio.volume = 0.5; audio.play().catch(() => { }); }
}

function showLevelUpModal(newName) {
    document.getElementById('new-level-name').innerText = newName;
    document.getElementById('level-up-modal').classList.add('active');
}

// [9] 스트릭 및 테마
function updateStreak() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastVisitStr = localStorage.getItem('lastVisitDate');
    let streak = parseInt(localStorage.getItem('studyStreak') || "0");
    if (!lastVisitStr) streak = 1;
    else {
        const lastVisit = new Date(lastVisitStr); lastVisit.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) streak++; else if (diffDays > 1) streak = 1;
    }
    localStorage.setItem('lastVisitDate', today.toDateString());
    localStorage.setItem('studyStreak', streak);
    const streakEl = document.getElementById('streak-display');
    if (streakEl) streakEl.innerHTML = streak >= 2 ? `🔥 ${streak}일째` : `🌱 1일째`;
}

function updateTheme(count) {
    let bg = "#f8fafc", text = "#111", point = "#eee", card = "#ffffff";
    if (count >= 400) { bg = "#0f172a"; text = "#f8fafc"; point = "#fbbf24"; card = "#1e293b"; }
    else if (count >= 200) { bg = "#fff7ed"; text = "#431407"; point = "#ea580c"; card = "#ffffff"; }
    else if (count >= 60) { bg = "#f0fdf4"; text = "#064e3b"; point = "#16a34a"; card = "#ffffff"; }
    else if (count >= 10) { bg = "#f0f9ff"; text = "#0c4a6e"; point = "#0284c7"; card = "#ffffff"; }
    document.body.style.backgroundColor = bg; document.body.style.color = text;
    const container = document.getElementById('mainContainer');
    if (container) { container.style.borderColor = point; container.style.backgroundColor = card; }
}

// [10] TTS 및 자동재생 제어
function toggle() {
    // 1. 상태 전환
    run = !run;

    // 2. UI 및 아이콘 변경
    document.getElementById('playIcon').style.display = run ? "none" : "block";
    document.getElementById('stopIcon').style.display = run ? "block" : "none";
    document.getElementById('tBtn').classList.toggle('active', run);

    if (run) {
        noSleep.enable(); 
        silenceAudio.play().catch(e => console.log("무음 재생 실패:", e));

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'FourLang',
                artist: 'Congsaam',
                album: 'BackGround Mode'
            });
            navigator.mediaSession.playbackState = 'playing';
        }

        // 4. 실제 학습 데이터 로직 실행
        loop(); 
        console.log("백그라운드 완전 유지 모드 시작");

    } else {
        // 중단 시 모든 기능 해제
        noSleep.disable();
        silenceAudio.pause();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
        resetTimer();
        console.log("학습 중단");
    }
}

function loop() {
    if (!run) return;
    update(); speak();
    t1 = setTimeout(() => document.getElementById('ko').classList.add('visible'), 3000);
    t2 = setTimeout(() => { if (!isRepeatOne) idx = (idx + 1) % totalCount; loop(); }, 8000);
}

function resetTimer() { clearTimeout(t1); clearTimeout(t2); window.speechSynthesis.cancel(); }

function speak(e) {
    if (e) e.stopPropagation();
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(sentences[idx][lang]);
    msg.lang = { en: 'en-US', cn: 'zh-CN', jp: 'ja-JP', es: 'es-ES' }[lang];
    window.speechSynthesis.speak(msg);
}

function speakWord(w, l) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(w);
    msg.lang = { en: 'en-US', cn: 'zh-CN', jp: 'ja-JP', es: 'es-ES' }[l];
    window.speechSynthesis.speak(msg);
}

// [11] 이동 및 기타 보조 함수
function prev() { resetTimer(); idx = (idx - 1 + totalCount) % totalCount; update(); if (run) loop(); }
function next() { resetTimer(); idx = (idx + 1) % totalCount; update(); if (run) loop(); }

function setLang(l) {
    localStorage.setItem('lastLang', l); lang = l;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    if (document.getElementById(l + 'Btn')) document.getElementById(l + 'Btn').classList.add('active');
    const mainEl = document.getElementById('main');
    if (l === 'cn' || l === 'jp') mainEl.classList.add('asian-lang'); else mainEl.classList.remove('asian-lang');
    if (document.getElementById('pron')) document.getElementById('pron').style.color = `var(--${l})`;
    resetTimer(); update(); if (run) loop();
}

function toggleStar(e) {
    if (e) e.stopPropagation();
    const key = `stars_${lang}`;
    let list = JSON.parse(localStorage.getItem(key) || "[]").map(s => String(s));
    const targetId = String(sentences[idx].id);
    const fIdx = list.indexOf(targetId);
    if (fIdx > -1) list.splice(fIdx, 1); else list.push(targetId);
    localStorage.setItem(key, JSON.stringify(list));
    update();
}

function toggleStarMode(e) {
    isStarMode = e.target.checked;
    const list = JSON.parse(localStorage.getItem(`stars_${lang}`) || "[]");
    if (isStarMode && list.length === 0) { alert("별표 표시한 문장이 없습니다!"); e.target.checked = false; isStarMode = false; return; }
    idx = 0; update();
}

function toggleDone(e) {
    const key = `done_${lang}`;
    let list = JSON.parse(localStorage.getItem(key) || "[]").map(id => String(id));
    const targetId = String(sentences[idx].id);
    if (e.target.checked) { if (!list.includes(targetId)) list.push(targetId); }
    else list = list.filter(id => id !== targetId);
    localStorage.setItem(key, JSON.stringify(list));
    update();
}

function closeModal() {
    document.getElementById('word-modal').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.classList.remove('modal-open');
}

function toggleRepeat() {
    isRepeatOne = !isRepeatOne;
    document.getElementById('repeatBtn').classList.toggle('repeat-on', isRepeatOne);
}

// [최종 실행]
loadData();