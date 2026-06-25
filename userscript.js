// ==UserScript==
// @name         Gambling Grades
// @namespace    http://tampermonkey.net
// @version      v0.1-alpha
// @description  Revealing grades in a very interesting manner
// @author       Cyclate
// @match        [YOUR-SCHOOL-GRADES-LINK]*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vic.edu.au
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";
    const RESULT_ROW_SELECTOR =
        "ul.activity-list.group[data-test='grades-subject']";
    const CLASS_NAME_SELECTOR = "li.subject-group h3";
    const ASSSESMENT_SELECTOR = "li.assessment";
    const ASSESSMENT_NAME_SELECTOR = ".small-12.card a p";
    const GRADE_SELECTOR = ".grade span";

    const GRADES = [
        { grade: "A+", percent: 90 },
        { grade: "A", percent: 80 },
        { grade: "B+", percent: 75 },
        { grade: "B", percent: 70 },
        { grade: "C+", percent: 65 },
        { grade: "C", percent: 60 },
        { grade: "D+", percent: 55 },
        { grade: "D", percent: 50 },
        { grade: "E+", percent: 45 },
        { grade: "E", percent: 40 },
        { grade: "UG", percent: 0 },
    ];
    const ALL_GRADE_STRINGS = GRADES.map((g) => g.grade);

    const GRADE_COLORS = {
        "A+": "#f1c40f",
        A: "#f39c12", // Gold / Orange-Gold
        "B+": "#9b59b6",
        B: "#8e44ad", // Purple / Dark Purple
        "C+": "#3498db",
        C: "#2980b9", // Blue / Dark Blue
        "D+": "#2ecc71",
        D: "#27ae60", // Green / Dark Green
        "E+": "#e67e22",
        E: "#d35400", // Orange / Dark Orange
        UG: "#e74c3c", // Red
    };

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    let grade_data = {};
    let styles = "";

    // Main Workflow
    cover_result_viewer();
    add_ui_styles();
    GM_addStyle(styles);
    window.addEventListener("DOMContentLoaded", () => {
        create_GG_ui();
        setup_ui_events();
        start_scanning();
    });
    // End Main Workflow

    function scrape_data() {
        const classes = document.querySelectorAll(RESULT_ROW_SELECTOR);
        let data = {};

        classes.forEach((cls) => {
            const class_name_el = cls.querySelector(CLASS_NAME_SELECTOR);

            if (!class_name_el) return;

            let class_name = class_name_el.innerHTML.trim();
            const assessments = cls.querySelectorAll(ASSSESMENT_SELECTOR);

            assessments.forEach((assessment_row) => {
                const assessment_name_el = assessment_row.querySelector(
                    ASSESSMENT_NAME_SELECTOR,
                );
                const grade_el = assessment_row.querySelector(GRADE_SELECTOR);

                if (!assessment_name_el || !grade_el) return;

                const assessment_name = assessment_name_el.innerText.trim();
                const raw = grade_el.innerText.trim();

                let percent;

                if (raw.includes("/")) {
                    const [score_1, score_2] = raw.split("/").map(Number);
                    percent = Math.round((score_1 / score_2) * 100);
                } else if (GRADES.some((g) => g.grade === raw)) {
                    percent = GRADES.find((g) => g.grade === raw).percent;
                } else {
                    percent = parseInt(raw.replace("%", ""), 10);
                }

                if (!percent && percent !== 0) return;

                const mapped_grade =
                    GRADES.find((g) => percent >= g.percent)?.grade || "UG";

                if (!data[class_name]) data[class_name] = [];
                data[class_name].push({
                    assessment_name: assessment_name,
                    grade: mapped_grade,
                    percent: percent,
                });
            });
        });

        return data;
    }

    function generate_grade_pool(actual_grade) {
        let actual_index = ALL_GRADE_STRINGS.indexOf(actual_grade);
        if (actual_index === -1) actual_index = 10;

        // FLATTENED: Give wider offsets a better chance of occurring
        function get_weighted_index(center) {
            const offsets = [
                0,
                0,
                0, // 0 (Slight preference to exact center)
                -1,
                -1,
                -1,
                1,
                1,
                1, // ±1
                -2,
                -2,
                -2,
                2,
                2,
                2, // ±2
                -3,
                -3,
                3,
                3, // ±3
                -4,
                -4,
                4,
                4, // ±4 (Increased chance from 5% to 10%)
                -5,
                5, // ±5 (Added to widen the spread slightly)
            ];

            const offset = offsets[Math.floor(Math.random() * offsets.length)];
            const idx = center + offset;

            return Math.max(0, Math.min(ALL_GRADE_STRINGS.length - 1, idx));
        }

        // Using a Set prevents duplicate grades from making the pool feel smaller/tighter
        let pool = new Set();
        const actual_is_wildcard = Math.random() < 0.2;

        if (actual_is_wildcard) {
            pool.add(actual_grade); // The wildcard

            let bunch_center_idx = Math.floor(
                Math.random() * ALL_GRADE_STRINGS.length,
            );

            // Keep generating until we have 5 unique items
            while (pool.size < 5) {
                pool.add(
                    ALL_GRADE_STRINGS[get_weighted_index(bunch_center_idx)],
                );
            }
        } else {
            pool.add(actual_grade); // Always include the actual grade

            // Keep generating items around the actual grade until we have 4 items
            // (Removed the "double offset" math)
            while (pool.size < 4) {
                pool.add(ALL_GRADE_STRINGS[get_weighted_index(actual_index)]);
            }

            // Add 1 completely random wildcard that isn't already in the pool
            while (pool.size < 5) {
                let random_wildcard =
                    ALL_GRADE_STRINGS[
                        Math.floor(Math.random() * ALL_GRADE_STRINGS.length)
                    ];
                pool.add(random_wildcard);
            }
        }

        // Convert Set back to array and shuffle
        return shuffle([...pool]);
    }

    function cover_result_viewer() {
        styles += `
            ${RESULT_ROW_SELECTOR} {
                filter: blur(10000px);
                user-select: none !important;
            }
        `;
    }

    function add_ui_styles() {
        styles += `
        #GG-control-panel {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 320px;

            background: #111;
            border: 2px solid #333;
            z-index: 999998;
            color: white;

            font-family: monospace, sans-serif;
            border-radius: 0;
        }
        .GG-cp-header {
            background: #222;
            color: #fff;
            padding: 12px;
            font-weight: bold;
            text-align: center;
            border-bottom: 2px solid #333;
        }
        .GG-cp-body {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .GG-cp-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .GG-cp-group label {
            font-size: 0.85rem;
            color: #888;
            text-transform: uppercase;
        }
        .GG-cp-select {
            padding: 10px;
            background: #000;
            border: 1px solid #444;
            color: white;
            outline: none;
            cursor: pointer;
            font-family: inherit;
            border-radius: 0;
        }
        .GG-cp-select:focus {
            border-color: #aaa;
            color: #fff;
        }
        .GG-cp-btn {
            background: #fff;
            color: #000;
            border: none;
            padding: 12px;

            font-weight: bold;
            font-size: 1rem;
            cursor: pointer;
            text-transform: uppercase;

            transition:
                background 0.1s,
                color 0.1s;
            border-radius: 0;
        }
        .GG-cp-btn:hover {
            background: #ccc;
        }
        .GG-cp-btn:disabled {
            background: #333;
            color: #666;
            cursor: not-allowed;
        }

        #GG-quit-GG-btn {
            background: #222;
            color: #888;
            border: 1px solid #444;
            margin-top: 5px;
            font-size: 0.85rem;
        }

        #GG-quit-GG-btn:hover {
            background: #e74c3c;
            color: white;
            border-color: #e74c3c;
        }

        /* OVERLAY AND ANIMATION STYLES */
        #GG-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;

            background: #0a0a0c;
            z-index: 999999;
            display: none;

            flex-direction: column;
            align-items: center;
            justify-content: center;

            font-family: monospace, sans-serif;
            overflow: hidden;
        }

        .reveal-title {
            color: #fff;
            font-size: 1.5rem;
            margin-bottom: 30px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .reveal-title span {
            color: #888;
            font-weight: bold;
        }

        #vertical-stage,
        #horizontal-stage {
            transition: opacity 0.5s ease;
            flex-direction: column;
            align-items: center;
        }

        /* Vertical Spinners */
        #v-spinners {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
        }
        .v-slot {
            width: 100px;
            height: 120px;
            border: 2px solid #333;
            background: #111;
            overflow: hidden;
            position: relative;
        }
        .v-strip {
            display: flex;
            flex-direction: column;
        }
        .v-card {
            width: 100px;
            height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            font-weight: bold;
            flex-shrink: 0;
        }

        /* Horizontal & Number Counter */
        #h-wrapper {
            display: flex;
            gap: 20px;
            align-items: center;
            margin-bottom: 30px;
        }
        .h-slot {
            height: 150px;
            width: 65vw;
            max-width: 800px;
            border: 2px solid #333;
            background: #111;
            overflow: hidden;
            position: relative;
        }
        .h-strip {
            display: flex;
            height: 100%;
            width: max-content;
        }
        .h-card {
            width: 140px;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3.5rem;
            font-weight: bold;
            border-right: 2px solid #222;
            flex-shrink: 0;
            background: #0a0a0a;
        }
        .center-line {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 50%;
            width: 4px;
            background: #fff;
            transform: translateX(-50%);
            z-index: 10;
        }

        .num-display {
            display: flex;
            align-items: flex-end;
            justify-content: center;

            height: 150px;
            padding: 0 30px;
            border: 2px solid #333;
            background: #111;
        }
        #percent-counter {
            font-size: 5.5rem;
            font-weight: bold;
            color: #333;
            line-height: 150px;
        }
        .num-display span {
            font-size: 2.5rem;
            color: #555;
            margin-bottom: 35px;
            margin-left: 5px;
        }
        `;
    }

    function start_scanning() {
        let attempts = 0;
        const scan_interval = setInterval(() => {
            grade_data = scrape_data();
            if (Object.keys(grade_data).length > 0) {
                populate_class_dropdown();
                clearInterval(scan_interval);
            }
            attempts++;
            if (attempts > 20) {
                clearInterval(scan_interval);
                const class_select = document.getElementById("GG-class-select");
                if (class_select && class_select.value === "") {
                    class_select.innerHTML =
                        '<option value="">No grades found...</option>';
                }
            }
        }, 1000);
    }

    function populate_class_dropdown() {
        const class_select = document.getElementById("GG-class-select");
        const classes = Object.keys(grade_data);
        if (classes.length === 0) return;

        class_select.innerHTML = '<option value="">-- Choose Class --</option>';

        classes.forEach((cls) => {
            const opt = document.createElement("option");
            opt.value = cls;
            opt.innerText = cls;
            class_select.appendChild(opt);
        });
    }

    function create_GG_ui() {
        const panel = document.createElement("div");
        panel.id = "GG-control-panel";
        panel.innerHTML = `
            <div class="GG-cp-header">Gambling Grades</div>
            <div class="GG-cp-body">
                <div class="GG-cp-group">
                    <label>Select Class</label>
                    <select id="GG-class-select" class="GG-cp-select">
                        <option value="">-- Scanning for classes... --</option>
                    </select>
                </div>
                <div class="GG-cp-group">
                    <label>Select Assessment</label>
                    <select id="GG-assessment-select" class="GG-cp-select" disabled>
                        <option value="">-- Select a class first --</option>
                    </select>
                </div>
                <button id="GG-reveal-btn" class="GG-cp-btn" disabled>INITIATE SEQUENCE</button>
                <button id="GG-quit-GG-btn" class="GG-cp-btn">Exit System</button>
            </div>
        `;
        document.body.appendChild(panel);

        const overlay = document.createElement("div");
        overlay.id = "GG-overlay";
        overlay.innerHTML = `
            <div class="reveal-title" id="reveal-title"></div>

            <div id="vertical-stage" style="display: none; opacity: 1;">
                <div id="v-spinners"></div>
                <button id="v-action-btn" class="GG-cp-btn" style="width: 250px;">START</button>
            </div>

            <div id="horizontal-stage" style="display: none; opacity: 0;">
                <div id="h-wrapper">
                    <div class="h-slot">
                        <div class="center-line"></div>
                        <div class="h-strip" id="h-strip"></div>
                    </div>
                    <div class="num-display">
                        <div id="percent-counter">00</div>
                        <span>%</span>
                    </div>
                </div>
                <button id="h-action-btn" class="GG-cp-btn" style="width: 250px;">START</button>
                <button id="reveal-percent-btn" class="GG-cp-btn" style="width: 250px; display: none; margin-top: 20px;">REVEAL %</button>
                <button id="finish-btn" class="GG-cp-btn" style="width: 250px; display: none; margin-top: 20px;">FINISH</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function setup_ui_events() {
        const class_select = document.getElementById("GG-class-select");
        const assessment_select = document.getElementById(
            "GG-assessment-select",
        );
        const reveal_btn = document.getElementById("GG-reveal-btn");
        const quit_btn = document.getElementById("GG-quit-GG-btn");

        class_select.addEventListener("change", (e) => {
            const selected_class = e.target.value;
            assessment_select.innerHTML =
                '<option value="">-- Choose Assessment --</option>';

            if (selected_class && grade_data[selected_class]) {
                grade_data[selected_class].forEach((assessment, index) => {
                    const option = document.createElement("option");
                    option.value = index;
                    option.innerText = assessment.assessment_name;
                    assessment_select.appendChild(option);
                });
                assessment_select.disabled = false;
                reveal_btn.disabled = true;
            } else {
                assessment_select.disabled = true;
                reveal_btn.disabled = true;
            }
        });

        assessment_select.addEventListener("change", (e) => {
            reveal_btn.disabled = e.target.value === "";
        });

        reveal_btn.addEventListener("click", () => {
            const class_name = class_select.value;
            const assessment_index = assessment_select.value;
            if (!class_name || assessment_index === "") return;

            const assessment_data = grade_data[class_name][assessment_index];
            const title_el = document.getElementById("reveal-title");
            title_el.innerHTML = `<span>${class_name}</span><br><br>${assessment_data.assessment_name}`;

            start_reveal_process(
                assessment_data.grade,
                assessment_data.percent,
            );
        });

        quit_btn.addEventListener("click", () => {
            const result_rows = document.querySelectorAll(RESULT_ROW_SELECTOR);
            result_rows.forEach((row) => {
                row.style.setProperty("filter", "none", "important");
                row.style.setProperty("color", "inherit", "important");
                row.style.setProperty("user-select", "auto", "important");
            });
            document.getElementById("GG-control-panel").remove();
            const overlay = document.getElementById("GG-overlay");
            if (overlay) overlay.remove();
        });
    }

    function play_vertical_phase(grade_pool) {
        return new Promise((resolve) => {
            const stage = document.getElementById("vertical-stage");
            const v_spinners = document.getElementById("v-spinners");
            const v_btn = document.getElementById("v-action-btn");

            v_spinners.innerHTML = "";
            stage.style.display = "flex";
            stage.style.opacity = "1";

            let v_states = ["IDLE", "IDLE", "IDLE", "IDLE", "IDLE"];
            // To animate downwards natively with prepends, we start offset negatively
            let v_y = [-120, -120, -120, -120, -120];
            let v_speeds = [0.4, 0.6, 0.8, 1.0, 1.2]; // Very readable idle speeds
            let v_strips = [];
            let v_raf;

            function createVCard(grade, isTarget = false) {
                const div = document.createElement("div");
                div.className = "v-card";
                div.innerText = grade;
                div.style.color = GRADE_COLORS[grade] || "#fff";
                div.style.opacity = isTarget ? "1" : "0.8";
                return div;
            }

            function getRandomGrade() {
                return ALL_GRADE_STRINGS[
                    Math.floor(Math.random() * ALL_GRADE_STRINGS.length)
                ];
            }

            // Build vertical slot machines (4 cards total per strip logic)
            for (let i = 0; i < 5; i++) {
                const col = document.createElement("div");
                col.className = "v-slot";
                const strip = document.createElement("div");
                strip.className = "v-strip";

                for (let j = 0; j < 4; j++) {
                    strip.appendChild(createVCard(getRandomGrade()));
                }

                strip.style.transform = `translateY(-120px)`;
                col.appendChild(strip);
                v_spinners.appendChild(col);
                v_strips.push(strip);
            }

            // Central physics & rendering loop
            function update_vertical() {
                let all_stopped = true;

                for (let i = 0; i < 5; i++) {
                    if (v_states[i] === "STOPPED") continue;
                    all_stopped = false;

                    v_y[i] += v_speeds[i];

                    // Reset boundary: Strip has visibly shifted 1 slot downwards
                    if (v_y[i] >= 0) {
                        if (
                            v_states[i] === "IDLE" ||
                            v_states[i] === "SPINNING"
                        ) {
                            v_y[i] -= 120;
                            v_strips[i].lastChild.remove();
                            v_strips[i].prepend(createVCard(getRandomGrade()));
                        } else if (v_states[i] === "STOP_REQUESTED") {
                            v_y[i] -= 120;
                            v_strips[i].lastChild.remove();
                            v_strips[i].prepend(
                                createVCard(grade_pool[i], true),
                            ); // Placed as the next incoming target
                            v_states[i] = "STOPPING";
                        } else if (v_states[i] === "STOPPING") {
                            // Target just snapped into view. Time to hard stop immediately.
                            v_y[i] = -120;
                            v_strips[i].lastChild.remove();
                            v_strips[i].prepend(createVCard(getRandomGrade()));
                            v_states[i] = "STOPPED";
                        }
                    }
                    v_strips[i].style.transform = `translateY(${v_y[i]}px)`;
                }

                if (!all_stopped) {
                    v_raf = requestAnimationFrame(update_vertical);
                } else {
                    global_state = "DONE";
                    v_btn.innerText = "CONTINUE";
                    v_btn.disabled = false;
                }
            }

            // Initiate infinite idle
            v_raf = requestAnimationFrame(update_vertical);

            let columns_stopped = 0;
            let global_state = "IDLE";
            v_btn.innerText = "START";
            v_btn.disabled = false;

            v_btn.onclick = () => {
                if (global_state === "IDLE") {
                    global_state = "SPINNING";
                    v_speeds = [10, 12, 14, 18, 25]; // Realistic slot spinning speeds
                    for (let i = 0; i < 5; i++) v_states[i] = "SPINNING";
                    v_btn.innerText = "STOP (1/5)";
                } else if (
                    global_state === "SPINNING" ||
                    global_state === "STOPPING_COLS"
                ) {
                    global_state = "STOPPING_COLS";
                    if (columns_stopped < 5) {
                        v_states[columns_stopped] = "STOP_REQUESTED";
                        columns_stopped++;
                        if (columns_stopped < 5) {
                            v_btn.innerText = `STOP (${columns_stopped + 1}/5)`;
                        } else {
                            global_state = "WAITING_FOR_STOP";
                            v_btn.innerText = "STOPPING...";
                            v_btn.disabled = true;
                        }
                    }
                } else if (global_state === "DONE") {
                    stage.style.opacity = "0";
                    setTimeout(() => {
                        stage.style.display = "none";
                        resolve();
                    }, 500);
                }
            };
        });
    }

    function count_up_to(target, duration, color) {
        const el = document.getElementById("percent-counter");
        el.style.color = color;

        let start_time = null;
        function step(timestamp) {
            if (!start_time) start_time = timestamp;
            const progress = timestamp - start_time;
            const ratio = Math.min(progress / duration, 1);

            // easeOutQuart
            const ease = 1 - Math.pow(1 - ratio, 4);
            const current = Math.floor(ease * target);

            el.innerText = current.toString().padStart(2, "0");

            if (progress < duration) {
                window.requestAnimationFrame(step);
            } else {
                el.innerText = target.toString().padStart(2, "0");
            }
        }
        window.requestAnimationFrame(step);
    }

    function play_horizontal_phase(actual_grade, grade_pool, percent) {
        return new Promise((resolve) => {
            const h_stage = document.getElementById("horizontal-stage");
            const h_strip = document.getElementById("h-strip");
            const h_btn = document.getElementById("h-action-btn");
            const finish_btn = document.getElementById("finish-btn");

            h_stage.style.display = "flex";
            setTimeout(() => (h_stage.style.opacity = "1"), 50);

            h_strip.innerHTML = "";
            h_strip.style.transition = "none";

            let h_x = 0;
            let h_speed = 1.0; // Slow horizontal idle loop right-to-left
            let h_raf;

            function createHCard(grade, color) {
                const div = document.createElement("div");
                div.className = "h-card";
                div.innerText = grade;
                div.style.color = color || GRADE_COLORS[grade] || "#888";
                return div;
            }

            function getRandomHGrade() {
                return grade_pool[
                    Math.floor(Math.random() * grade_pool.length)
                ];
            }

            // Setup sufficient array for infinite scrolling
            for (let i = 0; i < 15; i++) {
                h_strip.appendChild(createHCard(getRandomHGrade()));
            }
            h_strip.style.transform = `translateX(${h_x}px)`;

            // Infinite loop rendering
            function update_horizontal() {
                h_x -= h_speed;
                if (h_x <= -140) {
                    h_x += 140;
                    h_strip.firstChild.remove();
                    h_strip.appendChild(createHCard(getRandomHGrade()));
                }
                h_strip.style.transform = `translateX(${h_x}px)`;
                h_raf = requestAnimationFrame(update_horizontal);
            }

            // Reset counter UI
            document.getElementById("percent-counter").innerText = "00";
            document.getElementById("percent-counter").style.color = "#333";

            h_btn.style.display = "block";
            finish_btn.style.display = "none";
            h_btn.innerText = "START";

            // Start idling
            h_raf = requestAnimationFrame(update_horizontal);

            h_btn.onclick = async () => {
                h_btn.style.display = "none";
                cancelAnimationFrame(h_raf);

                const final_color = GRADE_COLORS[actual_grade] || "#fff";
                const container_width =
                    h_stage.querySelector(".h-slot").offsetWidth;

                const target_index = 165;
                const total_cards = 180;

                // Safely stitch massive array payload directly to the running loop offset
                for (let i = h_strip.children.length; i < total_cards; i++) {
                    if (i === target_index) {
                        h_strip.appendChild(
                            createHCard(actual_grade, final_color),
                        );
                    } else {
                        h_strip.appendChild(createHCard(getRandomHGrade()));
                    }
                }

                // Math to align index directly beneath the center marker
                const exact_center_pos =
                    target_index * 140 - container_width / 2 + 70;

                const do_edge_troll = Math.random() < 0.5;
                let initial_stop_pos = exact_center_pos;

                if (do_edge_troll) {
                    const edge_offset = 140 / 2 - 3;
                    const lean_left = Math.random() > 0.5;
                    initial_stop_pos =
                        exact_center_pos +
                        (lean_left ? edge_offset : -edge_offset);
                } else {
                    initial_stop_pos =
                        exact_center_pos + (Math.random() * 80 - 40);
                }

                // Explicitly align DOM transforms right before CSS swap for seamless handoff
                h_strip.style.transform = `translateX(${h_x}px)`;
                h_strip.offsetHeight;

                setTimeout(() => {
                    h_strip.style.transition =
                        "transform 18s cubic-bezier(0.02, 0.95, 0.1, 1)";
                    h_strip.style.transform = `translateX(-${initial_stop_pos}px)`;
                }, 50);

                await new Promise((r) => setTimeout(r, 18200));

                if (do_edge_troll) {
                    await new Promise((r) => setTimeout(r, 400));
                    h_strip.style.transition =
                        "transform 0.5s cubic-bezier(0.25, 1.5, 0.5, 1)";
                    h_strip.style.transform = `translateX(-${exact_center_pos}px)`;
                    await new Promise((r) => setTimeout(r, 600));
                }

                // Show Reveal button instead of automatically counting
                const reveal_percent_btn =
                    document.getElementById("reveal-percent-btn");
                reveal_percent_btn.style.display = "block";

                reveal_percent_btn.onclick = async () => {
                    reveal_percent_btn.style.display = "none";

                    // Start Counting Up Phase (Slower: changed from 3000 to 6000ms)
                    count_up_to(Math.min(percent, 99), 6000, final_color);

                    await new Promise((r) => setTimeout(r, 6200)); // Wait for slow animation

                    finish_btn.style.display = "block";
                    finish_btn.onclick = () => {
                        document.getElementById("GG-overlay").style.display =
                            "none";
                        resolve();
                    };
                };
            };
        });
    }

    async function start_reveal_process(actual_grade, actual_percent) {
        document.getElementById("GG-overlay").style.display = "flex";
        document.getElementById("vertical-stage").style.opacity = "1";
        document.getElementById("horizontal-stage").style.opacity = "0";
        document.getElementById("horizontal-stage").style.display = "none";

        const grade_pool = generate_grade_pool(actual_grade);
        await play_vertical_phase(grade_pool);
        await play_horizontal_phase(actual_grade, grade_pool, actual_percent);
    }

    // Features
    // Local Storage, Initialization, Notification on new grade
    // Results View Blocker
    // Select Result
    // Result Logic
    // Result Animation
})();
