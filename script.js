// Study Streak Tracker - script.js (external)
(function () {
	// Elements
	const timerDisplay = document.getElementById("timerDisplay");
	const startBtn = document.getElementById("startBtn");
	const pauseBtn = document.getElementById("pauseBtn");
	const resetBtn = document.getElementById("resetBtn");
	const focusInput = document.getElementById("focusInput");
	const breakInput = document.getElementById("breakInput");
	const modeBtns = document.querySelectorAll(".mode-btn");
	const progressBar = document.getElementById("progressBar");
	const motivText = document.getElementById("motivText");
	const sessionsPerCycleInput = document.getElementById("sessionsPerCycle");

	// custom-select root (DIV) and its internals
	const autoNextSelect = document.getElementById("autoNext");
	const autoNextSelected = autoNextSelect
		? autoNextSelect.querySelector(".selected")
		: null;
	const autoNextOptions = autoNextSelect
		? autoNextSelect.querySelectorAll(".options li")
		: [];

	const totalTimeEl = document.getElementById("totalTime");
	const currentStreakEl = document.getElementById("currentStreak");
	const longestStreakEl = document.getElementById("longestStreak");
	const weeklyStreakEl = document.getElementById("weeklyStreak");
	const sessionListEl = document.getElementById("sessionList");
	const clearSessionsBtn = document.getElementById("clearSessions");

	const audio = document.getElementById("audio");
	const musicToggle = document.getElementById("musicToggle");
	const volume = document.getElementById("volume");

	// State
	const STORAGE_KEY = "sst_data_v1";
	let state = {
		mode: "focus",
		running: false,
		remaining: 25 * 60,
		timerInterval: null,
		sessionsPerCycle: parseInt(sessionsPerCycleInput.value, 10) || 4,
		completedThisCycle: 0,
		sessions: [],
	};

	const MOTIVS = [
		"Nice work — one session down!",
		"Keep going — momentum builds habits!",
		"Focus mode: mastered ✨",
		"You're stacking wins — keep it up!",
		"Great job! Take a mindful breath.",
		"Consistency > intensity. Well done!",
	];

	// Custom select setup (open/close & selection)
	function setupCustomSelect() {
		if (!autoNextSelect) return;
		// initial dataset value exists in HTML as "false"
		autoNextSelected.dataset.value =
			autoNextSelected.dataset.value || "false";

		autoNextSelected.addEventListener("click", (e) => {
			e.stopPropagation();
			const opts = autoNextSelect.querySelector(".options");
			opts.style.display =
				opts.style.display === "block" ? "none" : "block";
		});

		autoNextOptions.forEach((li) => {
			li.addEventListener("click", (e) => {
				e.stopPropagation();
				autoNextSelected.textContent = li.textContent;
				autoNextSelected.dataset.value = li.dataset.value;
				autoNextSelect.querySelector(".options").style.display = "none";
				// persist setting
				localStorage.setItem("sst_autoNext", li.dataset.value);
			});
		});

		// close when clicking outside
		document.addEventListener("click", (e) => {
			if (!autoNextSelect.contains(e.target)) {
				const opts = autoNextSelect.querySelector(".options");
				if (opts) opts.style.display = "none";
			}
		});
	}

	// Utilities
	function load() {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed && parsed.sessions) {
					state.sessions = parsed.sessions;
					state.completedThisCycle = parsed.completedThisCycle || 0;
				}
			} catch (e) {
				/* ignore */
			}
		}

		// restore autoNext if previously saved
		const savedAuto = localStorage.getItem("sst_autoNext");
		if (savedAuto && autoNextSelected) {
			autoNextSelected.dataset.value = savedAuto;
			autoNextSelected.textContent = savedAuto === "true" ? "Yes" : "No";
		}

		updateUIFromSettings();
		renderSessions();
		recalcStats();
		updateProgressBar();
	}

	function save() {
		const payload = {
			sessions: state.sessions,
			completedThisCycle: state.completedThisCycle,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		// autoNext saved by the select click handler; save here as fallback
		if (autoNextSelected)
			localStorage.setItem(
				"sst_autoNext",
				autoNextSelected.dataset.value
			);
	}

	function secondsToMMSS(s) {
		s = Math.max(0, Math.round(s));
		const mm = Math.floor(s / 60)
			.toString()
			.padStart(2, "0");
		const ss = (s % 60).toString().padStart(2, "0");
		return `${mm}:${ss}`;
	}

	function updateTimerDisplay() {
		timerDisplay.textContent = secondsToMMSS(state.remaining);
	}

	function setMode(mode, resetRemaining = true) {
		state.mode = mode;
		modeBtns.forEach((b) =>
			b.classList.toggle("active", b.dataset.mode === mode)
		);
		if (resetRemaining) {
			const minutes =
				mode === "focus"
					? parseInt(focusInput.value, 10) || 25
					: parseInt(breakInput.value, 10) || 5;
			state.remaining = minutes * 60;
			updateTimerDisplay();
		}
	}

	function startTimer() {
		if (state.running) return;
		state.running = true;
		startBtn.textContent = "Running";
		startBtn.disabled = true;
		pauseBtn.disabled = false;
		state.timerInterval = setInterval(() => {
			state.remaining -= 1;
			updateTimerDisplay();
			if (state.remaining <= 0) {
				clearInterval(state.timerInterval);
				state.timerInterval = null;
				state.running = false;
				startBtn.disabled = false;
				startBtn.textContent = "Start";
				onTimerComplete();
			}
		}, 1000);
	}

	function pauseTimer() {
		if (!state.running) return;
		clearInterval(state.timerInterval);
		state.timerInterval = null;
		state.running = false;
		startBtn.disabled = false;
		startBtn.textContent = "Start";
	}

	function resetTimer() {
		pauseTimer();
		setMode(state.mode, true);
		motivText.textContent = "Timer reset — ready when you are.";
	}

	// handle when timer finishes
	function onTimerComplete() {
		if (state.mode === "focus") {
			const now = Date.now();
			const durationSec = (parseInt(focusInput.value, 10) || 25) * 60;
			state.sessions.unshift({
				ts: now,
				duration: durationSec,
				type: "focus",
			});
			if (state.sessions.length > 1000) state.sessions.length = 1000;
			state.completedThisCycle = (state.completedThisCycle || 0) + 1;
			showMotivation();
		} else {
			motivText.textContent = "Break ended — ready for another focus?";
		}

		save();
		renderSessions();
		recalcStats();
		updateProgressBar();

		// cycle handling
		handleCycleAfterCompletion();

		// switch modes
		const nextMode = state.mode === "focus" ? "break" : "focus";
		setMode(nextMode, true);

		// read auto-start from custom select .selected dataset
		let autoStart = false;
		try {
			if (
				autoNextSelected &&
				autoNextSelected.dataset &&
				autoNextSelected.dataset.value === "true"
			)
				autoStart = true;
		} catch (e) {
			autoStart = false;
		}

		if (autoStart) startTimer();
	}

	function showMotivation() {
		const msg = MOTIVS[Math.floor(Math.random() * MOTIVS.length)];
		motivText.textContent = msg;
	}

	function updateProgressBar() {
		const perCycle = Math.max(
			1,
			parseInt(sessionsPerCycleInput.value, 10) || 4
		);
		const pct = Math.min(
			100,
			((state.completedThisCycle % perCycle) / perCycle) * 100
		);
		progressBar.style.width = pct + "%";
		if (pct >= 75) timerDisplay.classList.add("pulse");
		else timerDisplay.classList.remove("pulse");
	}

	// Render sessions list
	function renderSessions() {
		sessionListEl.innerHTML = "";
		if (!state.sessions.length) {
			sessionListEl.innerHTML =
				'<div class="muted" style="padding:8px">No sessions yet — do one to start your streak!</div>';
			return;
		}
		state.sessions.slice(0, 40).forEach((s) => {
			const d = new Date(s.ts);
			const item = document.createElement("div");
			item.className = "session-item";
			const title = document.createElement("div");
			title.innerHTML = `<div style="font-weight:800">${d.toLocaleDateString()} <span class="muted" style="font-weight:700"> ${d.toLocaleTimeString(
				[],
				{ hour: "2-digit", minute: "2-digit" }
			)}</span></div>`;
			const right = document.createElement("div");
			right.innerHTML = `<div class="time">${Math.round(
				s.duration / 60
			)} min</div><div class="meta">${s.type}</div>`;
			item.appendChild(title);
			item.appendChild(right);
			sessionListEl.appendChild(item);
		});
	}

	// Stats / streak calculations
	function recalcStats() {
		const totalSeconds = state.sessions.reduce(
			(a, b) => a + (b.type === "focus" ? b.duration : 0),
			0
		);
		const totalMinutes = Math.round(totalSeconds / 60);
		totalTimeEl.textContent = totalMinutes + " min";

		const dateSet = new Set(
			state.sessions.map((s) => {
				const d = new Date(s.ts);
				const y = d.getFullYear();
				const m = (d.getMonth() + 1).toString().padStart(2, "0");
				const day = d.getDate().toString().padStart(2, "0");
				return `${y}-${m}-${day}`;
			})
		);

		const allDates = Array.from(dateSet).sort();
		const dateNums = allDates
			.map((ds) => {
				const [y, m, d] = ds.split("-").map(Number);
				return new Date(y, m - 1, d).getTime();
			})
			.sort((a, b) => a - b);

		let longest = 0,
			current = 0,
			prev = null;
		dateNums.forEach((ts) => {
			if (prev === null) current = 1;
			else {
				const diff = (ts - prev) / (1000 * 60 * 60 * 24);
				if (diff === 1) current++;
				else current = 1;
			}
			if (current > longest) longest = current;
			prev = ts;
		});
		longestStreakEl.textContent = longest;

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		let cur = 0;
		for (let i = 0; ; i++) {
			const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const key = `${d.getFullYear()}-${(d.getMonth() + 1)
				.toString()
				.padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
			if (dateSet.has(key)) cur++;
			else break;
		}
		currentStreakEl.textContent = cur;

		const weekSet = new Set(
			state.sessions.map((s) => {
				const d = new Date(s.ts);
				const [y, w] = getYearWeek(d);
				return `${y}-W${w}`;
			})
		);
		const now = new Date();
		const [curYear, curWeek] = getYearWeek(now);
		let weeklyStreak = 0;
		let checkYear = curYear,
			checkWeek = curWeek;
		while (true) {
			const key = `${checkYear}-W${checkWeek}`;
			if (weekSet.has(key)) weeklyStreak++;
			else break;
			const prevWeekDate = getDateFromYearWeek(checkYear, checkWeek);
			const prev = new Date(
				prevWeekDate.getTime() - 7 * 24 * 60 * 60 * 1000
			);
			const parts = getYearWeek(prev);
			checkYear = parts[0];
			checkWeek = parts[1];
		}
		weeklyStreakEl.textContent = weeklyStreak;

		document.getElementById("savedMsg").textContent = "Saved locally";
	}

	// ISO week helpers
	function getYearWeek(d) {
		const date = new Date(d.getTime());
		date.setHours(0, 0, 0, 0);
		date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
		const week1 = new Date(date.getFullYear(), 0, 4);
		const weekNo =
			1 +
			Math.round(
				((date.getTime() - week1.getTime()) / 86400000 -
					3 +
					((week1.getDay() + 6) % 7)) /
					7
			);
		return [date.getFullYear(), weekNo];
	}
	function getDateFromYearWeek(y, w) {
		const simple = new Date(y, 0, 1 + (w - 1) * 7);
		const dow = simple.getDay();
		const ISOdow = dow <= 0 ? 7 : dow;
		const diff = simple.getDate() - ISOdow + 1 + 3;
		return new Date(y, 0, diff);
	}

	// Event listeners
	startBtn.addEventListener("click", startTimer);
	pauseBtn.addEventListener("click", pauseTimer);
	resetBtn.addEventListener("click", resetTimer);

	modeBtns.forEach((b) =>
		b.addEventListener("click", () => setMode(b.dataset.mode, true))
	);

	focusInput.addEventListener("change", () => {
		if (state.mode === "focus" && !state.running) setMode("focus", true);
	});
	breakInput.addEventListener("change", () => {
		if (state.mode === "break" && !state.running) setMode("break", true);
	});

	sessionsPerCycleInput.addEventListener("change", () => {
		state.sessionsPerCycle = parseInt(sessionsPerCycleInput.value, 10) || 4;
		updateProgressBar();
		save();
	});

	clearSessionsBtn.addEventListener("click", () => {
		if (!confirm("Clear all saved sessions?")) return;
		state.sessions = [];
		state.completedThisCycle = 0;
		save();
		renderSessions();
		recalcStats();
		updateProgressBar();
	});

	musicToggle.addEventListener("click", () => {
		if (!audio.querySelector("source")) {
			alert(
				'No audio source found. Add a file named "lofi.mp3" in the same folder to enable music.'
			);
			return;
		}
		if (audio.paused) {
			audio.volume = parseFloat(volume.value);
			audio
				.play()
				.catch(() => alert("Autoplay blocked — click play again"));
			musicToggle.textContent = "Stop";
		} else {
			audio.pause();
			audio.currentTime = 0;
			musicToggle.textContent = "Play";
		}
	});
	volume.addEventListener("input", () => {
		audio.volume = parseFloat(volume.value);
	});

	// Cycle handling helper
	function handleCycleAfterCompletion() {
		const perCycle = Math.max(
			1,
			parseInt(sessionsPerCycleInput.value, 10) || 4
		);
		if (state.completedThisCycle >= perCycle) {
			state.completedThisCycle = 0;
			motivText.textContent =
				"Cycle complete! Take a longer break or celebrate 🎉";
		}
		save();
	}

	// UI init
	function updateUIFromSettings() {
		focusInput.value = focusInput.value || "25";
		breakInput.value = breakInput.value || "5";
		sessionsPerCycleInput.value = sessionsPerCycleInput.value || "4";
		setMode("focus", true);
	}

	// small safety
	pauseBtn.disabled = true;

	// debug: double-click to show count
	timerDisplay.addEventListener("dblclick", () =>
		alert("Sessions stored: " + state.sessions.length)
	);

	window.addEventListener("beforeunload", () => save());

	// Initialize custom select before loading saved settings
	setupCustomSelect();
	load();
})();
