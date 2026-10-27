let originalDFA = null;
let minimizedDFA = null;

const $ = id => document.getElementById(id);

function parseList(value) {
    return value.split(",").map(x => x.trim()).filter(Boolean);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showError(message) {
    $("error").textContent = message;
    $("error").classList.toggle("hidden", !message);
}

function loadSample() {
    $("states").value = "A,B,C,D,E";
    $("alphabet").value = "0,1";
    $("final").value = "C,E";
    $("testString").value = "010";

    buildTable();

    const transitions = {
        A: { "0": "B", "1": "C" },
        B: { "0": "A", "1": "D" },
        C: { "0": "E", "1": "C" },
        D: { "0": "E", "1": "C" },
        E: { "0": "E", "1": "C" }
    };

    document.querySelectorAll("[data-from]").forEach(input => {
        input.value = transitions[input.dataset.from][input.dataset.symbol];
    });
}

function buildTable() {
    showError("");

    const states = parseList($("states").value);
    const alphabet = parseList($("alphabet").value);

    if (!states.length || !alphabet.length) {
        showError("Enter states and alphabets.");
        return;
    }

    if (new Set(states).size !== states.length ||
        new Set(alphabet).size !== alphabet.length) {
        showError("States and alphabets must be unique.");
        return;
    }

    if (states.some(s => /[,\s]/.test(s)) ||
        alphabet.some(a => /[,\s]/.test(a))) {
        showError("State names and symbols cannot contain spaces or commas.");
        return;
    }

    const previous = {};

    document.querySelectorAll("[data-from]").forEach(input => {
        previous[input.dataset.from + "|" + input.dataset.symbol] =
            input.value;
    });

    $("start").innerHTML = states.map(state =>
        `<option value="${escapeHTML(state)}">${escapeHTML(state)}</option>`
    ).join("");

    $("inputTable").innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>State</th>
                    ${alphabet.map(a =>
                        `<th>${escapeHTML(a)}</th>`
                    ).join("")}
                </tr>
            </thead>
            <tbody>
                ${states.map(state => `
                    <tr>
                        <th>${escapeHTML(state)}</th>
                        ${alphabet.map(symbol => {
                            const key = state + "|" + symbol;
                            const value = previous[key] || state;

                            return `
                                <td>
                                    <input
                                        data-from="${escapeHTML(state)}"
                                        data-symbol="${escapeHTML(symbol)}"
                                        value="${escapeHTML(value)}"
                                    >
                                </td>
                            `;
                        }).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    $("oldCount").textContent = states.length;
    $("newCount").textContent = "—";
    $("removedCount").textContent = "—";

    originalDFA = null;
    minimizedDFA = null;

    $("originalDiagram").innerHTML = "";
    $("minimizedDiagram").innerHTML = "";
    $("originalInfo").textContent = "Transition table ready.";
    $("minimizedInfo").textContent = "Minimized DFA will appear here.";
    $("steps").textContent = "Click Minimise DFA to begin.";
    $("minTable").innerHTML = "";
}

function readDFA() {
    const states = parseList($("states").value);
    const alphabet = parseList($("alphabet").value);
    const finals = [...new Set(parseList($("final").value))];
    const start = $("start").value;

    if (!states.length || !alphabet.length) {
        throw Error("Enter states and alphabets.");
    }

    if (new Set(states).size !== states.length ||
        new Set(alphabet).size !== alphabet.length) {
        throw Error("States and alphabets must be unique.");
    }

    if (states.some(s => /[,\s]/.test(s)) ||
        alphabet.some(a => /[,\s]/.test(a))) {
        throw Error("State names and symbols cannot contain spaces or commas.");
    }

    if (!states.includes(start)) {
        throw Error("Invalid start state.");
    }

    if (finals.some(s => !states.includes(s))) {
        throw Error("Invalid final state.");
    }

    const transitions = {};

    states.forEach(state => {
        transitions[state] = {};

        alphabet.forEach(symbol => {
            const input = [...document.querySelectorAll("[data-from]")].find(
                el => el.dataset.from === state &&
                      el.dataset.symbol === symbol
            );

            if (!input || !states.includes(input.value.trim())) {
                throw Error(`Invalid transition: ${state} on ${symbol}`);
            }

            transitions[state][symbol] = input.value.trim();
        });
    });

    return { states, alphabet, start, finals, transitions };
}

function removeUnreachable(dfa) {
    const reachable = new Set([dfa.start]);
    const queue = [dfa.start];

    while (queue.length) {
        const state = queue.shift();

        dfa.alphabet.forEach(symbol => {
            const next = dfa.transitions[state][symbol];

            if (!reachable.has(next)) {
                reachable.add(next);
                queue.push(next);
            }
        });
    }

    const states = dfa.states.filter(s => reachable.has(s));
    const transitions = {};

    states.forEach(state => {
        transitions[state] = {};

        dfa.alphabet.forEach(symbol => {
            transitions[state][symbol] = dfa.transitions[state][symbol];
        });
    });

    return {
        dfa: {
            states,
            alphabet: dfa.alphabet,
            start: dfa.start,
            finals: dfa.finals.filter(s => reachable.has(s)),
            transitions
        },
        removed: dfa.states.filter(s => !reachable.has(s))
    };
}

function minimizeDFA(input) {
    const result = removeUnreachable(input);
    const dfa = result.dfa;

    let groups = [];

    const finals = dfa.states.filter(s => dfa.finals.includes(s));
    const nonFinals = dfa.states.filter(s => !dfa.finals.includes(s));

    if (finals.length) groups.push(finals);
    if (nonFinals.length) groups.push(nonFinals);

    const steps = [];

    steps.push({
        title: "Initial partition",
        message: "Separate final states and non-final states.",
        groups: groups.map(g => [...g])
    });

    function groupIndex(state) {
        return groups.findIndex(group => group.includes(state));
    }

    let changed = true;
    let iteration = 0;

    while (changed) {
        changed = false;
        iteration++;

        if (iteration > dfa.states.length + 1) {
            throw Error("Minimisation failed to converge.");
        }

        const nextGroups = [];

        for (const group of groups) {
            const buckets = new Map();

            for (const state of group) {
                const signature = dfa.alphabet.map(symbol =>
                    groupIndex(dfa.transitions[state][symbol])
                ).join(",");

                if (!buckets.has(signature)) {
                    buckets.set(signature, []);
                }

                buckets.get(signature).push(state);
            }

            nextGroups.push(...buckets.values());

            if (buckets.size > 1) changed = true;
        }

        groups = nextGroups;

        steps.push({
            title: `Refinement ${iteration}`,
            message: changed
                ? "Different transition signatures split some groups."
                : "Partition is stable. No more states can be merged.",
            groups: groups.map(g => [...g])
        });
    }

    const stateNames = {};
    const newStates = groups.map((_, i) => "Q" + (i + 1));

    groups.forEach((group, i) => {
        group.forEach(state => {
            stateNames[state] = newStates[i];
        });
    });

    const transitions = {};

    groups.forEach((group, i) => {
        const newState = newStates[i];
        const representative = group[0];

        transitions[newState] = {};

        dfa.alphabet.forEach(symbol => {
            transitions[newState][symbol] =
                stateNames[dfa.transitions[representative][symbol]];
        });
    });

    const minimized = {
        states: newStates,
        alphabet: dfa.alphabet,
        start: stateNames[dfa.start],
        finals: groups
            .map((group, i) =>
                group.some(s => dfa.finals.includes(s))
                    ? newStates[i]
                    : null
            )
            .filter(Boolean),
        transitions
    };

    return {
        minimized,
        groups,
        steps,
        removed: result.removed,
        reachableStates: dfa.states
    };
}

function minimize() {
    try {
        showError("");

        originalDFA = readDFA();

        const result = minimizeDFA(originalDFA);
        minimizedDFA = result.minimized;

        $("oldCount").textContent = originalDFA.states.length;
        $("newCount").textContent = minimizedDFA.states.length;
        $("removedCount").textContent =
            originalDFA.states.length - minimizedDFA.states.length;

        $("originalInfo").innerHTML =
            `Start: <b>${escapeHTML(originalDFA.start)}</b> | ` +
            `Final: ${originalDFA.finals.map(escapeHTML).join(", ") || "None"}`;

        $("minimizedInfo").innerHTML =
            `Start: <b>${escapeHTML(minimizedDFA.start)}</b> | ` +
            `Final: ${minimizedDFA.finals.map(escapeHTML).join(", ") || "None"}`;

        renderDiagram(originalDFA, "originalDiagram");
        renderDiagram(minimizedDFA, "minimizedDiagram");
        renderSteps(result);
        renderMinTable(minimizedDFA);

    } catch (error) {
        showError(error.message);
    }
}

function renderSteps(result) {
    $("steps").innerHTML = `
        <p class="small">
            Unreachable states removed:
            ${result.removed.map(escapeHTML).join(", ") || "None"}
        </p>

        <ol class="steps">
            ${result.steps.map(step => `
                <li>
                    <b>${escapeHTML(step.title)}</b><br>
                    <span class="small">${escapeHTML(step.message)}</span><br>

                    ${step.groups.map(group =>
                        `<span class="badge">
                            {${group.map(escapeHTML).join(", ")}}
                        </span>`
                    ).join("")}
                </li>
            `).join("")}
        </ol>

        <div class="result-box">
            <b class="good">Minimisation Complete!</b><br>

            ${result.groups.map((group, i) =>
                `<span class="badge">
                    Q${i + 1} = {${group.map(escapeHTML).join(", ")}}
                </span>`
            ).join("")}
        </div>
    `;
}

function renderMinTable(dfa) {
    $("minTable").innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>State</th>
                    ${dfa.alphabet.map(a =>
                        `<th>${escapeHTML(a)}</th>`
                    ).join("")}
                </tr>
            </thead>
            <tbody>
                ${dfa.states.map(state => `
                    <tr>
                        <th>
                            ${dfa.start === state ? "→ " : ""}
                            ${dfa.finals.includes(state) ? "* " : ""}
                            ${escapeHTML(state)}
                        </th>

                        ${dfa.alphabet.map(symbol =>
                            `<td>${escapeHTML(dfa.transitions[state][symbol])}</td>`
                        ).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>

        <p class="small">→ Start state | * Final state</p>
    `;
}

function renderDiagram(dfa, svgId) {
    const svg = $(svgId);
    const width = 650;
    const height = 300;
    const count = dfa.states.length;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    if (!count) {
        svg.innerHTML = "";
        return;
    }

    const radius = count === 1 ? 0 : Math.min(190, 45 + count * 23);
    const cx = width / 2;
    const cy = height / 2 + 8;
    const nodeR = 25;

    const positions = {};

    dfa.states.forEach((state, i) => {
        const angle = -Math.PI / 2 + 2 * Math.PI * i / count;

        positions[state] = count === 1
            ? { x: cx, y: cy }
            : {
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle)
            };
    });

    const arrowId = svgId + "Arrow";

    let markup = `
        <defs>
            <marker id="${arrowId}"
                markerWidth="8" markerHeight="8"
                refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3" fill="#aab8d6"/>
            </marker>
        </defs>
    `;

    const edges = new Map();

    dfa.states.forEach(from => {
        dfa.alphabet.forEach(symbol => {
            const to = dfa.transitions[from][symbol];
            const key = from + "->" + to;

            if (!edges.has(key)) edges.set(key, []);
            edges.get(key).push(symbol);
        });
    });

    for (const [key, symbols] of edges) {
        const [from, to] = key.split("->");
        const p1 = positions[from];
        const p2 = positions[to];

        if (from === to) {
            markup += `
                <path
                    d="M ${p1.x - 15} ${p1.y - 19}
                       C ${p1.x - 48} ${p1.y - 70},
                         ${p1.x + 48} ${p1.y - 70},
                         ${p1.x + 15} ${p1.y - 19}"
                    fill="none"
                    stroke="#aab8d6"
                    marker-end="url(#${arrowId})"/>

                <text x="${p1.x}" y="${p1.y - 52}"
                    fill="#dbe5ff" text-anchor="middle" font-size="12">
                    ${escapeHTML(symbols.join(","))}
                </text>
            `;
        } else {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distance = Math.hypot(dx, dy) || 1;

            const ux = dx / distance;
            const uy = dy / distance;

            const x1 = p1.x + ux * nodeR;
            const y1 = p1.y + uy * nodeR;
            const x2 = p2.x - ux * (nodeR + 4);
            const y2 = p2.y - uy * (nodeR + 4);

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            markup += `
                <path
                    d="M ${x1} ${y1} L ${x2} ${y2}"
                    stroke="#aab8d6"
                    fill="none"
                    marker-end="url(#${arrowId})"/>

                <text x="${mx}" y="${my - 7}"
                    fill="#dbe5ff"
                    text-anchor="middle"
                    font-size="12">
                    ${escapeHTML(symbols.join(","))}
                </text>
            `;
        }
    }

    const startPos = positions[dfa.start];

    markup += `
        <path
            d="M ${startPos.x - 53} ${startPos.y}
               L ${startPos.x - 28} ${startPos.y}"
            stroke="#36d6a0"
            fill="none"
            stroke-width="2"
            marker-end="url(#${arrowId})"/>
    `;

    dfa.states.forEach(state => {
        const p = positions[state];
        const isFinal = dfa.finals.includes(state);

        markup += `
            <circle cx="${p.x}" cy="${p.y}" r="${nodeR}"
                fill="${isFinal ? "#163e3a" : "#202d49"}"
                stroke="${isFinal ? "#36d6a0" : "#7c83ff"}"
                stroke-width="2"/>

            ${isFinal ? `
                <circle cx="${p.x}" cy="${p.y}" r="${nodeR - 5}"
                    fill="none" stroke="#36d6a0"/>
            ` : ""}

            <text x="${p.x}" y="${p.y + 5}"
                text-anchor="middle"
                fill="white"
                font-size="14"
                font-weight="bold">
                ${escapeHTML(state)}
            </text>
        `;
    });

    svg.innerHTML = markup;
}

function testString() {
    try {
        const dfa = readDFA();
        const input = $("testString").value;

        const tokens = dfa.alphabet.some(a => a.length > 1)
            ? (input.trim() ? input.trim().split(/\s+/) : [])
            : Array.from(input);

        const invalid = tokens.find(s => !dfa.alphabet.includes(s));

        if (invalid !== undefined) {
            $("testResult").innerHTML =
                `<span class="error">Invalid symbol: ${escapeHTML(invalid)}</span>`;
            return;
        }

        let current = dfa.start;
        const path = [current];

        for (const symbol of tokens) {
            current = dfa.transitions[current][symbol];
            path.push(current);
        }

        const accepted = dfa.finals.includes(current);

        $("testResult").innerHTML = `
            <b class="${accepted ? "good" : "error"}">
                ${accepted ? "✓ ACCEPTED" : "✗ REJECTED"}
            </b>

            <p>Input: ${escapeHTML(input || "(empty string)")}</p>

            <p>Path: ${path.map(escapeHTML).join(" → ")}</p>

            <p>Final State: <b>${escapeHTML(current)}</b></p>
        `;

    } catch (error) {
        $("testResult").innerHTML =
            `<span class="error">${escapeHTML(error.message)}</span>`;
    }
}

buildTable();
