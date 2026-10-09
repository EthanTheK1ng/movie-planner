const SUPABASE_URL = "https://edcmnuriwutqxprzhkhz.supabase.co";
const SUPABASE_KEY = "sb_publishable_22TfmhqUAKMqUIIk_H2qDg_12gWaj2e";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const make = (tag, className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
};

const subjects = {
    "AP Biology": {
        color: "#22c55e",
        icon: "icons/biology.png",
        classroomUrl: "https://classroom.google.com/c/ODc2ODQwNTAyMTY1"
    },
    APUSH: {
        color: "#3392ff",
        icon: "icons/apush.png",
        classroomUrl: "https://classroom.google.com/c/ODg0NTI0NzExODgy"
    },
    "AP Calculus": {
        color: "#475775",
        icon: "icons/calculus.png",
        classroomUrl: "https://classroom.google.com/c/ODc4MDY5ODc0MzQy"
    },
    "AP Lang": {
        color: "#c5c33a",
        icon: "icons/lang.png",
        classroomUrl: "https://classroom.google.com/c/ODg0MzYwNDc1NDcx"
    },
    "AP Computer Science A": {
        color: "#171718",
        icon: "icons/computer-science.png",
        classroomUrl: "https://platform.ilearnnyc.net/d2l/home/891149"
    },
    Spanish: {
        color: "#fc0a0a",
        icon: "icons/spanish.png",
        classroomUrl: "https://classroom.google.com/c/ODg1MTg0NzI3MTI4"
    },
    Gym: {
        color: "#1de0e0",
        icon: "icons/gym.png",
        classroomUrl: "https://classroom.google.com/c/ODc4MzQ0ODU4MTQy"
    },
    "SAT Class": {
        color: "#f59e0b",
        icon: "icons/sat-test.png",
        classroomUrl: "https://citysmarts.testpress.in/learn/97/?content_detail_v2=true"
    },
    Other: {
        color: "#6b7280",
        icon: "",
        classroomUrl: ""
    }
};

const typeLabels = {
    assignment: "Assignment",
    project: "Project",
    exam: "Exam",
    quiz: "Quiz",
    event: "Event"
};

const priorityRank = {
    high: 0,
    medium: 1,
    low: 2
};

const typeRank = {
    exam: 0,
    project: 1,
    event: 2,
    quiz: 3,
    assignment: 4
};

const bucketDefinitions = [
    ["overdue", "OVERDUE"],
    ["today", "TODAY"],
    ["tomorrow", "TOMORROW"],
    ["this-week", "THIS WEEK"],
    ["later", "LATER"],
    ["no-date", "NO DUE DATE"]
];

const DEFAULT_SETTINGS = {
    theme: "system",
    due_text_weight: 800,
    entry_title_weight: 600,
    compact_entries: false,
    animations_enabled: true,
    show_next_up: true,
    notifications_enabled: true,
    notify_days_ahead: 3,
    notify_overdue: true,
    notify_assignments: true,
    notify_exams: true,
    notify_quizzes: true,
    notify_events: true,
    weekday_times: ["06:55", "15:30", "19:00"],
    weekend_times: ["08:00", "12:00", "19:00"]
};

const LOCAL_SETTINGS_KEY = "planner-local-settings";

const LOCAL_SETTING_KEYS = [
    "theme",
    "due_text_weight",
    "entry_title_weight",
    "compact_entries",
    "animations_enabled",
    "show_next_up"
];

const TIME_OF_DAY_LIGHT_HOUR = 7;
const TIME_OF_DAY_DARK_HOUR = 20;

function timeOfDayTheme(date = new Date()) {
    const hour = date.getHours();
    return hour >= TIME_OF_DAY_DARK_HOUR ||
        hour < TIME_OF_DAY_LIGHT_HOUR
        ? "dark"
        : "light";
}

function loadLocalSettings() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(LOCAL_SETTINGS_KEY) || "{}"
        );

        const legacyTheme =
            localStorage.getItem("planner-theme");

        if (!saved.theme && legacyTheme) {
            saved.theme = legacyTheme;
        }

        return Object.fromEntries(
            LOCAL_SETTING_KEYS
                .filter(key => saved[key] !== undefined)
                .map(key => [key, saved[key]])
        );
    } catch {
        return {};
    }
}

function saveLocalSettings(settings) {
    const local = Object.fromEntries(
        LOCAL_SETTING_KEYS.map(key => [
            key,
            settings[key]
        ])
    );

    localStorage.setItem(
        LOCAL_SETTINGS_KEY,
        JSON.stringify(local)
    );
}

function cloudSettingsPayload(settings) {
    return {
        notifications_enabled:
            settings.notifications_enabled,

        notify_days_ahead:
            settings.notify_days_ahead,

        notify_overdue:
            settings.notify_overdue,

        notify_assignments:
            settings.notify_assignments,

        notify_exams:
            settings.notify_exams,

        notify_quizzes:
            settings.notify_quizzes,

        notify_events:
            settings.notify_events,

        weekday_times:
            settings.weekday_times,

        weekend_times:
            settings.weekend_times,

        updated_at:
            settings.updated_at
    };
}

(function applySavedThemeImmediately() {
    const local = loadLocalSettings();

    const saved =
        local.theme ||
        localStorage.getItem("planner-theme") ||
        "system";

    const actual =
        saved === "time-of-day"
            ? timeOfDayTheme()
            : saved === "system"
                ? matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                : saved;

    if (actual === "light" || actual === "dark") {
        document.documentElement.dataset.theme =
            actual;
    }
})();

let plannerSettings = {
    ...DEFAULT_SETTINGS
};

let entries = [];
let subtasks = [];
let recurringRules = [];

let editingEntryId = null;
let actionEntry = null;
let noDueDateSelected = false;
let advancedOptionsOpen = false;
let customRecurrenceDays = new Set();

let entriesRealtimeChannel = null;
let subtasksRealtimeChannel = null;
let realtimeReloadTimer = null;
let suppressRealtimeReload = false;
let latestLoadRequest = 0;
let lastEntriesSignature = "";
let lastSubtasksSignature = "";

let calendarViewOpen = false;

let calendarMonth =
    new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
    );

let selectedCalendarDate = null;

let undoState = null;
let undoTimer = null;

let smartPlanState = {
    minutes: 90,
    energy: "normal",
    includeBreaks: true,
    includeStudy: true,
    lastPlan: null
};

const dom = {
    loading: $("app-loading-screen"),

    greeting: $("greeting-text"),
    currentDate: $("current-date"),

    workloadCard: $("workload-card"),
    workloadLevel: $("workload-level"),
    workloadMeta: $("workload-meta"),

    quickAddForm: $("quick-add-form"),
    quickAddInput: $("quick-add-input"),
    quickAddButton: $("quick-add-button"),
    quickAddHint: $("quick-add-hint"),

    assignmentCount: $("assignment-count"),
    projectCount: $("project-count"),
    examCount: $("exam-count"),
    quizCount: $("quiz-count"),
    eventCount: $("event-count"),

    entryGroups: $("entry-groups"),
    completedList: $("completed-list"),
    clearCompleted: $("clear-completed-button"),
    newEntry: $("new-entry-button"),

    calendarToggle: $("calendar-view-toggle"),
    calendarView: $("calendar-view"),
    calendarPrev: $("calendar-prev-month"),
    calendarNext: $("calendar-next-month"),
    calendarToday: $("calendar-today-button"),
    calendarTitle: $("calendar-month-title"),
    calendarGrid: $("calendar-grid"),
    calendarDetails: $("calendar-day-details"),

    dialog: $("new-entry-dialog"),
    form: $("new-entry-form"),
    dialogTitle: $("entry-dialog-title"),
    closeDialog: $("close-entry-button"),

    name: $("entry-name"),
    subject: $("entry-subject"),
    subjectOptions: $("subject-options"),

    type: $("entry-type"),
    typeOptions: $("type-options"),

    priority: $("entry-priority"),
    priorityOptions: $("priority-options"),

    estimate: $("entry-estimate"),
    estimateOptions: $("estimate-options"),

    customUrl: $("entry-custom-url"),
    assignmentPlanning: $("assignment-planning-fields"),

    advancedToggle: $("advanced-options-toggle"),
    advancedText: $("advanced-options-text"),
    advancedPanel: $("advanced-options-panel"),

    dueDate: $("entry-due-date"),
    dueTomorrow: $("due-tomorrow-button"),
    noDueDate: $("no-due-date-button"),
    dueTime: $("entry-due-time"),

    notes: $("entry-notes"),
    extraFields: $("entry-extra-fields"),

    recurrenceFields: $("recurrence-fields"),
    recurrence: $("entry-recurrence"),
    recurrenceOptions: $("recurrence-options"),

    customDays: $("custom-recurrence-days"),
    recurringEditNote: $("recurring-edit-note"),

    save: $("save-entry-button"),
    saveText: $("save-entry-button-text"),

    actionsDialog: $("entry-actions-dialog"),
    actionsName: $("actions-entry-name"),
    pinEntry: $("pin-entry-button"),
    subtasksEntry: $("subtasks-entry-button"),
    editEntry: $("edit-entry-button"),
    stopRecurring: $("stop-recurring-button"),
    deleteEntry: $("delete-entry-button"),
    cancelActions: $("cancel-entry-actions-button"),

    subtasksDialog: $("subtasks-dialog"),
    subtasksTitle: $("subtasks-title"),
    subtasksProgress: $("subtasks-progress"),
    subtasksList: $("subtasks-list"),
    subtasksForm: $("subtasks-form"),
    subtaskInput: $("subtask-input"),
    closeSubtasks: $("close-subtasks-button"),

    undoToast: $("undo-toast"),
    undoText: $("undo-text"),
    undoButton: $("undo-button"),

    nextUpCard: $("next-up-card"),
    nextUpSubject: $("next-up-subject"),
    nextUpName: $("next-up-name"),
    nextUpMeta: $("next-up-meta"),
    nextUpPriority: $("next-up-priority"),
    nextUpEdit: $("next-up-edit-button"),

    smartPlanButton: $("smart-plan-button"),
    smartPlanButtonLabel: $("smart-plan-button-label"),
    smartPlanDialog: $("smart-plan-dialog"),
    closeSmartPlan: $("close-smart-plan-button"),
    smartPlanTitle: $("smart-plan-title"),
    smartPlanSubtitle: $("smart-plan-subtitle"),
    smartPlanDaypartBadge: $("smart-plan-daypart-badge"),
    smartPlanControls: $("smart-plan-controls"),
    smartPlanDurationSlider: $("smart-plan-duration-slider"),
    smartPlanDurationValue: $("smart-plan-duration-value"),
    smartPlanDurationHint: $("smart-plan-duration-hint"),
    smartPlanDurationPresets: $("smart-plan-duration-presets"),
    smartPlanEnergyOptions: $("smart-plan-energy-options"),
    smartPlanBreaks: $("smart-plan-breaks"),
    smartPlanStudy: $("smart-plan-study"),
    generateSmartPlan: $("generate-smart-plan-button"),
    smartPlanResults: $("smart-plan-results"),
    smartPlanSummary: $("smart-plan-summary"),
    smartPlanInsight: $("smart-plan-insight"),
    smartPlanTimeline: $("smart-plan-timeline"),
    smartPlanLeftover: $("smart-plan-leftover"),
    rebuildSmartPlan: $("rebuild-smart-plan-button"),
    finishSmartPlan: $("finish-smart-plan-button"),

    settingsButton: $("settings-button"),
    settingsDialog: $("settings-dialog"),
    settingsForm: $("settings-form"),
    closeSettings: $("close-settings-button"),
    themeOptions: $("theme-options"),

    dueWeight: $("due-weight-slider"),
    dueWeightValue: $("due-weight-value"),
    titleWeight: $("title-weight-slider"),
    titleWeightValue: $("title-weight-value"),

    compactEntries: $("compact-entries-setting"),
    animations: $("animations-setting"),
    showNextUp: $("show-next-up-setting"),

    notificationsEnabled: $("notifications-enabled-setting"),
    notificationBody: $("notification-settings-body"),
    notifyDaysAhead: $("notify-days-ahead-setting"),
    notifyOverdue: $("notify-overdue-setting"),
    notifyAssignments: $("notify-assignments-setting"),
    notifyExams: $("notify-exams-setting"),
    notifyQuizzes: $("notify-quizzes-setting"),
    notifyEvents: $("notify-events-setting"),

    weekdayTimes: [
        $("weekday-time-1"),
        $("weekday-time-2"),
        $("weekday-time-3")
    ],

    weekendTimes: [
        $("weekend-time-1"),
        $("weekend-time-2"),
        $("weekend-time-3")
    ],

    settingsStatus: $("settings-status"),
    saveSettings: $("save-settings-button")
};

function ensureTimeOfDayThemeOption() {
    if (!dom.themeOptions) return;

    dom.themeOptions.style.gridTemplateColumns =
        "repeat(2, minmax(0, 1fr))";

    if (
        dom.themeOptions.querySelector(
            '[data-value="time-of-day"]'
        )
    ) {
        return;
    }

    const button =
        make(
            "button",
            "settings-choice theme-choice",
            "Time of Day"
        );

    button.type = "button";
    button.dataset.value = "time-of-day";

    button.title =
        "Light from 7:00 AM to 7:59 PM, dark from 8:00 PM to 6:59 AM";

    dom.themeOptions.append(button);
}

ensureTimeOfDayThemeOption();

function resolveTheme(theme) {
    if (theme === "time-of-day") {
        return timeOfDayTheme();
    }

    if (theme === "system") {
        return matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches
            ? "dark"
            : "light";
    }

    return theme === "dark"
        ? "dark"
        : "light";
}

function weightLabel(weight) {
    return {
        400: "Regular",
        500: "Medium",
        600: "Semi-bold",
        700: "Bold",
        800: "Extra bold",
        900: "Heavy"
    }[Number(weight)] || String(weight);
}

function applySettings() {
    const actualTheme =
        resolveTheme(
            plannerSettings.theme
        );

    document.documentElement.dataset.theme =
        actualTheme;

    localStorage.setItem(
        "planner-theme",
        actualTheme
    );

    document.documentElement.style.setProperty(
        "--due-weight",
        plannerSettings.due_text_weight
    );

    document.documentElement.style.setProperty(
        "--entry-title-weight",
        plannerSettings.entry_title_weight
    );

    document.body.classList.toggle(
        "compact-entries",
        plannerSettings.compact_entries
    );

    document.body.classList.toggle(
        "no-animations",
        !plannerSettings.animations_enabled
    );

    renderAll();
}

function selectThemeButton(theme) {
    $$(
        ".theme-choice",
        dom.themeOptions
    ).forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.value === theme
        );
    });
}

function fillTimeInputs(
    inputs,
    values = []
) {
    inputs.forEach(
        (input, index) => {
            input.value =
                values[index] || "";
        }
    );
}

function readTimeInputs(inputs) {
    return inputs
        .map(input => input.value)
        .filter(Boolean);
}

function updateNotificationSettingsDisabledState() {
    dom.notificationBody.classList.toggle(
        "disabled",
        !dom.notificationsEnabled.checked
    );
}

function fillSettingsForm() {
    selectThemeButton(
        plannerSettings.theme
    );

    dom.dueWeight.value =
        plannerSettings.due_text_weight;

    dom.titleWeight.value =
        plannerSettings.entry_title_weight;

    dom.dueWeightValue.textContent =
        weightLabel(
            plannerSettings.due_text_weight
        );

    dom.titleWeightValue.textContent =
        weightLabel(
            plannerSettings.entry_title_weight
        );

    dom.compactEntries.checked =
        plannerSettings.compact_entries;

    dom.animations.checked =
        plannerSettings.animations_enabled;

    dom.showNextUp.checked =
        plannerSettings.show_next_up;

    dom.notificationsEnabled.checked =
        plannerSettings.notifications_enabled;

    dom.notifyDaysAhead.value =
        String(
            plannerSettings.notify_days_ahead
        );

    dom.notifyOverdue.checked =
        plannerSettings.notify_overdue;

    dom.notifyAssignments.checked =
        plannerSettings.notify_assignments;

    dom.notifyExams.checked =
        plannerSettings.notify_exams;

    dom.notifyQuizzes.checked =
        plannerSettings.notify_quizzes;

    dom.notifyEvents.checked =
        plannerSettings.notify_events;

    fillTimeInputs(
        dom.weekdayTimes,
        plannerSettings.weekday_times
    );

    fillTimeInputs(
        dom.weekendTimes,
        plannerSettings.weekend_times
    );

    updateNotificationSettingsDisabledState();
}

async function loadPlannerSettings() {
    const local =
        loadLocalSettings();

    const { data, error } =
        await supabaseClient
            .from("planner_settings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();

    if (error) {
        console.error(
            "Could not load settings:",
            error
        );
    }

    plannerSettings = {
        ...DEFAULT_SETTINGS,
        ...(data || {}),
        ...local
    };

    applySettings();
    fillSettingsForm();
}

function readSettingsForm() {
    return {
        theme:
            $$(
                ".theme-choice.selected",
                dom.themeOptions
            )[0]?.dataset.value ||
            "system",

        due_text_weight:
            Number(
                dom.dueWeight.value
            ),

        entry_title_weight:
            Number(
                dom.titleWeight.value
            ),

        compact_entries:
            dom.compactEntries.checked,

        animations_enabled:
            dom.animations.checked,

        show_next_up:
            dom.showNextUp.checked,

        notifications_enabled:
            dom.notificationsEnabled.checked,

        notify_days_ahead:
            Number(
                dom.notifyDaysAhead.value
            ),

        notify_overdue:
            dom.notifyOverdue.checked,

        notify_assignments:
            dom.notifyAssignments.checked,

        notify_exams:
            dom.notifyExams.checked,

        notify_quizzes:
            dom.notifyQuizzes.checked,

        notify_events:
            dom.notifyEvents.checked,

        weekday_times:
            readTimeInputs(
                dom.weekdayTimes
            ),

        weekend_times:
            readTimeInputs(
                dom.weekendTimes
            ),

        updated_at:
            new Date().toISOString()
    };
}

async function savePlannerSettings() {
    const next =
        readSettingsForm();

    const wasEnabled =
        plannerSettings.notifications_enabled;

    saveLocalSettings(next);

    plannerSettings = {
        ...plannerSettings,
        ...next
    };

    applySettings();

    dom.saveSettings.disabled =
        true;

    dom.saveSettings.textContent =
        "Saving…";

    dom.settingsStatus.textContent =
        "";

    const { error } =
        await supabaseClient
            .from("planner_settings")
            .update(
                cloudSettingsPayload(next)
            )
            .eq("id", 1);

    dom.saveSettings.disabled =
        false;

    dom.saveSettings.textContent =
        "Save Settings";

    if (error) {
        console.error(error);

        dom.settingsStatus.textContent =
            "Appearance saved locally. Notifications could not sync.";

        dom.settingsStatus.style.color =
            "#d97706";

        return;
    }

    dom.settingsStatus.textContent =
        "Settings saved";

    dom.settingsStatus.style.color =
        "#16a34a";

    if (
        next.notifications_enabled &&
        !wasEnabled &&
        typeof window.enableNotifications ===
            "function"
    ) {
        try {
            await window.enableNotifications();
        } catch (error) {
            console.warn(error);
        }
    }

    setTimeout(() => {
        if (
            dom.settingsStatus.textContent ===
            "Settings saved"
        ) {
            dom.settingsStatus.textContent =
                "";
        }
    }, 1800);
}

dom.settingsButton?.addEventListener(
    "click",
    () => {
        fillSettingsForm();
        dom.settingsDialog.showModal();
    }
);

dom.closeSettings?.addEventListener(
    "click",
    () => dom.settingsDialog.close()
);

dom.settingsDialog?.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            dom.settingsDialog
        ) {
            dom.settingsDialog.close();
        }
    }
);

$$(
    ".theme-choice",
    dom.themeOptions
).forEach(button => {
    button.addEventListener(
        "click",
        () => {
            selectThemeButton(
                button.dataset.value
            );

            document.documentElement.dataset.theme =
                resolveTheme(
                    button.dataset.value
                );
        }
    );
});

dom.dueWeight?.addEventListener(
    "input",
    () => {
        dom.dueWeightValue.textContent =
            weightLabel(
                dom.dueWeight.value
            );

        document.documentElement.style.setProperty(
            "--due-weight",
            dom.dueWeight.value
        );
    }
);

dom.titleWeight?.addEventListener(
    "input",
    () => {
        dom.titleWeightValue.textContent =
            weightLabel(
                dom.titleWeight.value
            );

        document.documentElement.style.setProperty(
            "--entry-title-weight",
            dom.titleWeight.value
        );
    }
);

dom.notificationsEnabled?.addEventListener(
    "change",
    updateNotificationSettingsDisabledState
);

dom.settingsForm?.addEventListener(
    "submit",
    async event => {
        event.preventDefault();
        await savePlannerSettings();
    }
);

matchMedia(
    "(prefers-color-scheme: dark)"
).addEventListener(
    "change",
    () => {
        if (
            plannerSettings.theme ===
            "system"
        ) {
            applySettings();
        }
    }
);

function refreshAutomaticTheme() {
    if (
        [
            "system",
            "time-of-day"
        ].includes(
            plannerSettings.theme
        )
    ) {
        const next =
            resolveTheme(
                plannerSettings.theme
            );

        if (
            document.documentElement.dataset.theme !==
            next
        ) {
            document.documentElement.dataset.theme =
                next;

            localStorage.setItem(
                "planner-theme",
                next
            );
        }
    }
}

setInterval(
    refreshAutomaticTheme,
    60000
);

function showGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    const byDay = {
        0: [
            "Sunday reset, Ethan",
            "Sunday… let’s make tomorrow less painful",
            "Tomorrow is Monday. Prepare accordingly."
        ],

        1: [
            "Monday. We meet again.",
            "Monday survival mode",
            "Monday is unfortunately real"
        ],

        2: [
            "Tuesday: at least it’s not Monday",
            "Tuesday grind, Ethan",
            "One day closer to Friday"
        ],

        3: [
            "Halfway through the week, Ethan",
            "Wednesday. We’re getting there.",
            "Halfway to the weekend"
        ],

        4: [
            "Almost Friday, Ethan",
            "We are SO close to Friday",
            "Thursday is basically pre-Friday"
        ],

        5: [
            "Thank GOD it’s Friday",
            "FRIDAY. We made it.",
            "WE MADE IT TO FRIDAY",
            "Friday detected. Morale increased."
        ],

        6: [
            "Weekend mode, Ethan",
            "Saturday homework is criminal, but let’s get it done",
            "Quick homework, then freedom"
        ]
    };

    const byTime =
        hour < 7
            ? [
                "Before 7 AM? You’re locked in.",
                "Why are we awake this early?",
                "Early start. Respect."
            ]
            : hour < 12
                ? [
                    "Good morning, Ethan",
                    "Morning, Ethan — let’s get ahead",
                    "Fresh day, fresh to-do list"
                ]
                : hour < 15
                    ? [
                        "Good afternoon, Ethan",
                        "Midday check-in. What’s next?"
                    ]
                    : hour < 18
                        ? [
                            "School’s out. Time to clear the list.",
                            "Afternoon grind, Ethan",
                            "Do it now so 9 PM Ethan doesn’t hate you"
                        ]
                        : hour < 21
                            ? [
                                "Good evening, Ethan",
                                "Let’s finish strong tonight",
                                "A little work now, a lot less stress later"
                            ]
                            : [
                                "Late one, Ethan — let’s wrap this up",
                                "Okay Ethan, speedrun the homework",
                                "It’s getting late. Prioritize."
                            ];

    const general = [
        "Welcome back, Ethan",
        "What’s on the list, Ethan?",
        "Let’s clear some stuff off the list",
        "Alright, let’s lock in",
        "Time to cook"
    ];

    const roll = Math.random();

    const pool =
        roll < 0.6
            ? byDay[day]
            : roll < 0.85
                ? byTime
                : general;

    dom.greeting.textContent =
        pool[
            Math.floor(
                Math.random() *
                pool.length
            )
        ];

    dom.currentDate.textContent =
        now.toLocaleDateString(
            "en-US",
            {
                weekday: "long",
                month: "long",
                day: "numeric"
            }
        );
}

function parseDate(value) {
    if (!value) return null;

    const [year, month, day] =
        value
            .split("-")
            .map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}

function dateInput(date) {
    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(
        2,
        "0"
    )}-${String(
        date.getDate()
    ).padStart(
        2,
        "0"
    )}`;
}

function addDays(
    date,
    amount
) {
    const copy =
        new Date(date);

    copy.setDate(
        copy.getDate() +
        amount
    );

    return copy;
}

function getDaysUntilDue(value) {
    if (!value) return null;

    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    const due =
        parseDate(value);

    due.setHours(
        0,
        0,
        0,
        0
    );

    return Math.round(
        (due - today) /
        86400000
    );
}

function getDueText(value) {
    const days =
        getDaysUntilDue(value);

    if (days === null) {
        return "No due date";
    }

    if (days < 0) {
        return "Overdue";
    }

    if (days === 0) {
        return "Today";
    }

    if (days === 1) {
        return "Tomorrow";
    }

    return `${days} days`;
}

function formatShortDate(value) {
    if (!value) {
        return "No date";
    }

    const date =
        parseDate(value);

    return `${
        date.getMonth() + 1
    }/${date.getDate()}`;
}

function formatDateTitle(value) {
    if (
        !value ||
        value === "none"
    ) {
        return "No Due Date";
    }

    return parseDate(value)
        .toLocaleDateString(
            "en-US",
            {
                weekday: "long",
                month: "short",
                day: "numeric"
            }
        );
}

function formatTime(value) {
    if (!value) return "";

    const [hour, minute] =
        value
            .split(":")
            .map(Number);

    const date = new Date();

    date.setHours(
        hour,
        minute,
        0,
        0
    );

    return date.toLocaleTimeString(
        "en-US",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}

function formatEstimate(minutes) {
    if (!minutes) return "";

    if (minutes < 60) {
        return `~${minutes} min`;
    }

    const hours =
        Math.floor(
            minutes / 60
        );

    const remaining =
        minutes % 60;

    if (remaining) {
        return `~${hours}h ${remaining}m`;
    }

    return minutes >= 120
        ? `~${hours}+ hr`
        : `~${hours} hr`;
}

function formatTotalMinutes(minutes) {
    if (!minutes) return "";

    const hours =
        Math.floor(
            minutes / 60
        );

    const remaining =
        minutes % 60;

    if (!hours) {
        return `~${remaining} min`;
    }

    return remaining
        ? `~${hours}h ${remaining}m`
        : `~${hours}h`;
}

const isWorkEntry =
    entry =>
        [
            "assignment",
            "project"
        ].includes(
            entry.type
        );

function weekEnd(
    date = new Date()
) {
    const d =
        new Date(date);

    d.setHours(
        0,
        0,
        0,
        0
    );

    const day =
        d.getDay() || 7;

    return addDays(
        d,
        7 - day
    );
}

function getBucket(entry) {
    if (!entry.dueDate) {
        return "no-date";
    }

    const days =
        getDaysUntilDue(
            entry.dueDate
        );

    if (days < 0) {
        return "overdue";
    }

    if (days === 0) {
        return "today";
    }

    if (days === 1) {
        return "tomorrow";
    }

    return parseDate(
        entry.dueDate
    ) <= weekEnd()
        ? "this-week"
        : "later";
}

function normalizeUrl(value) {
    const raw =
        String(
            value || ""
        ).trim();

    if (!raw) return null;

    try {
        const url =
            new URL(
                /^[a-zA-Z][a-zA-Z\d+.-]*:/
                    .test(raw)
                    ? raw
                    : `https://${raw}`
            );

        return [
            "http:",
            "https:"
        ].includes(
            url.protocol
        )
            ? url.href
            : null;

    } catch {
        return null;
    }
}

function getEntrySubtasks(entryId) {
    return subtasks
        .filter(
            subtask =>
                Number(subtask.entryId) ===
                Number(entryId)
        )
        .sort(
            (a, b) =>
                (a.sortOrder ?? 0) -
                (b.sortOrder ?? 0) ||
                Number(a.id) -
                Number(b.id)
        );
}

function getSubtaskProgress(entryId) {
    const list =
        getEntrySubtasks(entryId);

    const completed =
        list.filter(
            subtask =>
                subtask.completed
        ).length;

    const total =
        list.length;

    return {
        completed,
        total,
        percent:
            total
                ? Math.round(
                    completed /
                    total *
                    100
                )
                : 0
    };
}

function showUndo(
    text,
    undo
) {
    clearTimeout(
        undoTimer
    );

    undoState = undo;

    if (!dom.undoToast) {
        return;
    }

    dom.undoText.textContent =
        text;

    dom.undoToast.hidden =
        false;

    requestAnimationFrame(
        () =>
            dom.undoToast.classList.add(
                "show"
            )
    );

    undoTimer =
        setTimeout(
            hideUndo,
            5000
        );
}

function hideUndo() {
    clearTimeout(
        undoTimer
    );

    undoTimer = null;
    undoState = null;

    if (!dom.undoToast) {
        return;
    }

    dom.undoToast.classList.remove(
        "show"
    );

    setTimeout(
        () => {
            if (
                !dom.undoToast.classList.contains(
                    "show"
                )
            ) {
                dom.undoToast.hidden =
                    true;
            }
        },
        220
    );
}

dom.undoButton?.addEventListener(
    "click",
    async () => {
        const action =
            undoState;

        if (!action) return;

        hideUndo();

        try {
            await action();
        } catch (error) {
            console.error(error);
            alert(
                "Could not undo that action."
            );
        }
    }
);

function getSmartPlanProfile(
    now = new Date()
) {
    const hour =
        now.getHours();

    if (
        hour >= 5 &&
        hour < 12
    ) {
        return {
            phase: "morning",
            buttonLabel: "Plan My Day",
            title: "Plan My Day",
            badge: "MORNING PLAN",
            defaultEnergy: "high",
            maxSuggested: 180,
            subtitle:
                "Morning mode puts difficult, important work earlier while your energy is usually better."
        };
    }

    if (
        hour >= 12 &&
        hour < 17
    ) {
        return {
            phase: "afternoon",
            buttonLabel: "Plan My Day",
            title: "Plan My Day",
            badge: "AFTERNOON PLAN",
            defaultEnergy: "normal",
            maxSuggested: 150,
            subtitle:
                "I’ll balance urgent work with what is realistic to finish before the evening."
        };
    }

    if (
        hour >= 17 &&
        hour < 21
    ) {
        return {
            phase: "evening",
            buttonLabel: "Plan My Night",
            title: "Plan My Night",
            badge: "EVENING PLAN",
            defaultEnergy: "normal",
            maxSuggested: 120,
            subtitle:
                "Evening mode puts deadlines first, then mixes in shorter wins so the plan stays realistic."
        };
    }

    return {
        phase: "late",
        buttonLabel: "Plan My Night",
        title: "Plan My Night",
        badge: "LATE-NIGHT PLAN",
        defaultEnergy: "low",
        maxSuggested: 75,
        subtitle:
            "Late-night mode focuses on urgent work, uses shorter blocks, and avoids building an unrealistic marathon."
    };
}

function updateSmartPlanButton() {
    const profile =
        getSmartPlanProfile();

    dom.smartPlanButtonLabel.textContent =
        profile.buttonLabel;

    dom.smartPlanButton.title =
        `${profile.buttonLabel} using deadlines, priority, and work time`;
}

function formatPlannerDuration(minutes) {
    const value =
        Math.max(
            0,
            Math.round(
                Number(minutes) || 0
            )
        );

    const hours =
        Math.floor(
            value / 60
        );

    const remaining =
        value % 60;

    if (!hours) {
        return `${remaining}m`;
    }

    if (!remaining) {
        return `${hours}h`;
    }

    return `${hours}h ${remaining}m`;
}

function formatPlanClock(date) {
    return date.toLocaleTimeString(
        "en-US",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}

function dueUrgencyScore(days) {
    if (days == null) {
        return 110;
    }

    if (days < 0) {
        return 1050 +
            Math.min(
                Math.abs(days) * 25,
                200
            );
    }

    if (days === 0) return 920;
    if (days === 1) return 760;
    if (days === 2) return 620;
    if (days === 3) return 520;

    if (days <= 7) {
        return 410 -
            (days - 4) * 30;
    }

    return Math.max(
        90,
        260 -
        days * 8
    );
}

function smartEstimateAssignment(entry) {
    if (
        Number(
            entry.estimatedMinutes
        ) > 0
    ) {
        return {
            minutes:
                Number(
                    entry.estimatedMinutes
                ),
            inferred: false
        };
    }

    const text =
        `${entry.name || ""} ${entry.notes || ""}`
            .toLowerCase();

    let minutes = 25;

    if (
        /\b(project|essay|presentation|lab report|research paper)\b/
            .test(text)
    ) {
        minutes = 60;
    } else if (
        /\b(read|reading|chapter|pages)\b/
            .test(text)
    ) {
        minutes = 35;
    } else if (
        /\b(study|review|notes|outline)\b/
            .test(text)
    ) {
        minutes = 30;
    } else if (
        /\b(worksheet|homework|problem set|deltamath|questions|practice)\b/
            .test(text)
    ) {
        minutes = 30;
    } else if (
        /\b(finish|corrections|edit|revise)\b/
            .test(text)
    ) {
        minutes = 20;
    }

    if (
        entry.priority === "high"
    ) {
        minutes += 10;
    }

    if (
        entry.priority === "low"
    ) {
        minutes -= 5;
    }

    if (
        (
            getDaysUntilDue(
                entry.dueDate
            ) ?? 99
        ) <= 0
    ) {
        minutes += 5;
    }

    return {
        minutes:
            Math.min(
                90,
                Math.max(
                    15,
                    Math.round(
                        minutes / 5
                    ) * 5
                )
            ),

        inferred: true
    };
}

function getDueTimeBoost(entry) {
    if (
        !entry.dueDate ||
        !entry.dueTime ||
        getDaysUntilDue(
            entry.dueDate
        ) !== 0
    ) {
        return 0;
    }

    const [hour, minute] =
        entry.dueTime
            .split(":")
            .map(Number);

    const now =
        new Date();

    const difference =
        hour * 60 +
        minute -
        (
            now.getHours() * 60 +
            now.getMinutes()
        );

    if (difference <= 0) {
        return 160;
    }

    if (difference <= 60) {
        return 140;
    }

    if (difference <= 180) {
        return 95;
    }

    return 35;
}

function buildSmartPlanCandidates(
    profile,
    includeStudy,
    energy
) {
    const result = [];

    for (
        const entry of
        getOpenEntries()
    ) {
        if (
            isWorkEntry(entry)
        ) {
            const estimate =
                smartEstimateAssignment(
                    entry
                );

            const days =
                getDaysUntilDue(
                    entry.dueDate
                );

            let score =
                dueUrgencyScore(days) +
                getDueTimeBoost(entry);

            score +=
                entry.priority === "high"
                    ? 185
                    : entry.priority === "medium"
                        ? 60
                        : 0;

            if (
                entry.pinned
            ) {
                score += 220;
            }

            if (
                energy === "low"
            ) {
                score +=
                    estimate.minutes <= 30
                        ? 55
                        : estimate.minutes >= 60 &&
                            (
                                days == null ||
                                days > 1
                            )
                            ? -30
                            : 0;
            }

            if (
                energy === "high" &&
                estimate.minutes >= 45
            ) {
                score += 35;
            }

            if (
                profile.phase === "late" &&
                estimate.minutes <= 30
            ) {
                score += 30;
            }

            result.push({
                key:
                    `${entry.type}-${entry.id}`,

                kind:
                    entry.type,

                entry,

                subject:
                    entry.subject,

                title:
                    entry.name,

                days,

                priority:
                    entry.priority ||
                    "medium",

                score,

                estimatedMinutes:
                    estimate.minutes,

                originalMinutes:
                    estimate.minutes,

                inferred:
                    estimate.inferred,

                color:
                    subjects[
                        entry.subject
                    ]?.color ||
                    "#6b7280"
            });

            continue;
        }

        if (
            !includeStudy ||
            ![
                "exam",
                "quiz"
            ].includes(
                entry.type
            )
        ) {
            continue;
        }

        const days =
            getDaysUntilDue(
                entry.dueDate
            );

        if (
            days == null ||
            days < 0 ||
            days > 7
        ) {
            continue;
        }

        const isExam =
            entry.type === "exam";

        const minutes =
            days <= 1
                ? isExam
                    ? 45
                    : 30
                : days <= 3
                    ? isExam
                        ? 35
                        : 25
                    : isExam
                        ? 25
                        : 15;

        let score =
            dueUrgencyScore(days) -
            (
                isExam
                    ? 80
                    : 145
            );

        if (
            entry.pinned
        ) {
            score += 220;
        }

        if (
            profile.phase === "morning" &&
            days <= 2
        ) {
            score += 25;
        }

        result.push({
            key:
                `study-${entry.id}`,

            kind:
                "study",

            entry,

            subject:
                entry.subject,

            title:
                `Study for ${entry.name}`,

            days,

            priority:
                "medium",

            score,

            estimatedMinutes:
                minutes,

            originalMinutes:
                minutes,

            inferred:
                true,

            color:
                subjects[
                    entry.subject
                ]?.color ||
                "#6b7280"
        });
    }

    return result;
}

function compareSmartPlanCandidates(
    a,
    b,
    profile,
    energy
) {
    const scoreGap =
        b.score -
        a.score;

    if (
        Math.abs(scoreGap) >
        70
    ) {
        return scoreGap;
    }

    if (
        energy === "low" ||
        profile.phase === "late"
    ) {
        const shorter =
            a.estimatedMinutes -
            b.estimatedMinutes;

        if (shorter) {
            return shorter;
        }
    }

    if (
        energy === "high" &&
        profile.phase !== "late"
    ) {
        const harder =
            b.estimatedMinutes -
            a.estimatedMinutes;

        if (harder) {
            return harder;
        }
    }

    return (
        scoreGap ||
        (a.days ?? 999) -
        (b.days ?? 999) ||
        a.estimatedMinutes -
        b.estimatedMinutes
    );
}

function calculateRecommendedPlanMinutes(profile) {
    const candidates =
        buildSmartPlanCandidates(
            profile,
            true,
            profile.defaultEnergy
        );

    if (!candidates.length) {
        return 45;
    }

    const urgent =
        candidates.filter(
            candidate =>
                (
                    candidate.days != null &&
                    candidate.days <= 1
                ) ||
                candidate.priority === "high"
        );

    const urgentMinutes =
        urgent.reduce(
            (total, candidate) =>
                total +
                candidate.estimatedMinutes,
            0
        );

    const allMinutes =
        candidates.reduce(
            (total, candidate) =>
                total +
                candidate.estimatedMinutes,
            0
        );

    let target =
        urgentMinutes ||
        Math.min(
            allMinutes,
            90
        );

    if (
        urgentMinutes &&
        urgentMinutes < 60 &&
        allMinutes >
        urgentMinutes
    ) {
        target =
            Math.min(
                allMinutes,
                urgentMinutes + 45
            );
    }

    target =
        Math.max(
            profile.phase === "late"
                ? 30
                : 45,
            target
        );

    target =
        Math.min(
            profile.maxSuggested,
            target
        );

    return Math.min(
        240,
        Math.max(
            30,
            Math.round(
                target / 15
            ) * 15
        )
    );
}

function setSmartPlanEnergy(value) {
    smartPlanState.energy =
        value;

    $$(
        ".smart-plan-energy-button",
        dom.smartPlanEnergyOptions
    ).forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.value ===
            value
        );
    });
}

function updateSmartPlanDurationUI() {
    const minutes =
        Number(
            dom.smartPlanDurationSlider.value
        );

    smartPlanState.minutes =
        minutes;

    dom.smartPlanDurationValue.textContent =
        formatPlannerDuration(
            minutes
        );

    $$(
        ".smart-plan-duration-button",
        dom.smartPlanDurationPresets
    ).forEach(button => {
        button.classList.toggle(
            "selected",
            Number(
                button.dataset.minutes
            ) === minutes
        );
    });
}

function smartPlanReason(
    item,
    planned
) {
    if (
        item.kind === "study"
    ) {
        return `${
            typeLabels[
                item.entry.type
            ]
        } ${
            getDueText(
                item.entry.dueDate
            ).toLowerCase()
        } · adaptive study block`;
    }

    const parts = [
        getDueText(
            item.entry.dueDate
        )
    ];

    if (
        item.priority === "high"
    ) {
        parts.push(
            "Hard priority"
        );
    }

    if (
        item.entry?.pinned
    ) {
        parts.push(
            "Pinned"
        );
    }

    if (
        item.inferred
    ) {
        parts.push(
            "time auto-estimated"
        );
    }

    if (
        planned <
        item.originalMinutes
    ) {
        parts.push(
            `${planned}m focus block of ~${item.originalMinutes}m`
        );
    }

    return parts.join(" · ");
}

function createSmartPlanSchedule(
    totalMinutes,
    profile,
    energy,
    includeBreaks,
    includeStudy
) {
    const queue =
        buildSmartPlanCandidates(
            profile,
            includeStudy,
            energy
        )
            .sort(
                (a, b) =>
                    compareSmartPlanCandidates(
                        a,
                        b,
                        profile,
                        energy
                    )
            )
            .map(item => ({
                ...item,
                remainingMinutes:
                    item.estimatedMinutes
            }));

    const schedule = [];

    let remaining =
        totalMinutes;

    let workSinceBreak = 0;

    let current =
        new Date();

    current.setSeconds(
        0,
        0
    );

    const maxChunk =
        energy === "low"
            ? 35
            : energy === "high"
                ? 70
                : 50;

    while (
        queue.length &&
        remaining >= 10
    ) {
        if (
            includeBreaks &&
            workSinceBreak >= 50 &&
            remaining >= 20
        ) {
            const breakMinutes =
                Math.min(
                    workSinceBreak >= 90
                        ? 10
                        : 5,
                    remaining
                );

            const start =
                new Date(current);

            const end =
                new Date(
                    current.getTime() +
                    breakMinutes * 60000
                );

            schedule.push({
                kind: "break",
                minutes: breakMinutes,
                start,
                end
            });

            current = end;
            remaining -= breakMinutes;
            workSinceBreak = 0;

            continue;
        }

        queue.sort(
            (a, b) =>
                compareSmartPlanCandidates(
                    a,
                    b,
                    profile,
                    energy
                )
        );

        const item =
            queue.shift();

        let chunk =
            Math.min(
                item.remainingMinutes,
                maxChunk,
                remaining
            );

        chunk =
            Math.floor(
                chunk / 5
            ) * 5;

        if (chunk < 10) {
            break;
        }

        const start =
            new Date(current);

        const end =
            new Date(
                current.getTime() +
                chunk * 60000
            );

        schedule.push({
            ...item,
            plannedMinutes:
                chunk,
            start,
            end
        });

        current = end;
        remaining -= chunk;
        workSinceBreak += chunk;

        const left =
            item.remainingMinutes -
            chunk;

        if (left >= 10) {
            queue.push({
                ...item,
                remainingMinutes:
                    left,

                estimatedMinutes:
                    left,

                score:
                    item.score -
                    75,

                continuation:
                    true
            });
        }
    }

    return {
        schedule,

        freeMinutes:
            remaining,

        leftoverCandidates:
            queue,

        totalMinutes
    };
}

function renderSmartPlanSummary(plan) {
    const work =
        plan.schedule
            .filter(
                item =>
                    item.kind !==
                    "break"
            )
            .reduce(
                (total, item) =>
                    total +
                    item.plannedMinutes,
                0
            );

    const breaks =
        plan.schedule
            .filter(
                item =>
                    item.kind ===
                    "break"
            )
            .reduce(
                (total, item) =>
                    total +
                    item.minutes,
                0
            );

    const blocks =
        plan.schedule
            .filter(
                item =>
                    item.kind !==
                    "break"
            )
            .length;

    dom.smartPlanSummary.innerHTML =
        "";

    const data = [
        [
            formatPlannerDuration(
                plan.totalMinutes
            ),
            "AVAILABLE"
        ],

        [
            formatPlannerDuration(
                work
            ),
            "WORK"
        ],

        [
            breaks
                ? formatPlannerDuration(
                    breaks
                )
                : "0m",
            "BREAKS"
        ],

        [
            String(blocks),
            blocks === 1
                ? "BLOCK"
                : "BLOCKS"
        ]
    ];

    data.forEach(
        ([value, label]) => {
            const card =
                make(
                    "div",
                    "smart-plan-summary-item"
                );

            card.append(
                make(
                    "span",
                    "smart-plan-summary-number",
                    value
                ),

                make(
                    "span",
                    "smart-plan-summary-label",
                    label
                )
            );

            dom.smartPlanSummary.append(
                card
            );
        }
    );
}

function buildSmartPlanInsight(
    plan,
    profile,
    energy
) {
    const work =
        plan.schedule.filter(
            item =>
                item.kind !==
                "break"
        );

    if (!work.length) {
        return "There is nothing useful to schedule in this time window right now.";
    }

    const hasOverdue =
        work.some(
            item =>
                [
                    "assignment",
                    "project"
                ].includes(
                    item.kind
                ) &&
                item.days != null &&
                item.days < 0
        );

    const hasToday =
        work.some(
            item =>
                item.days === 0
        );

    const first =
        hasOverdue
            ? "I put overdue work at the front of the plan."
            : hasToday
                ? "Today’s deadlines get first priority."
                : "I ranked the plan by deadline, priority, and estimated effort.";

    const second =
        profile.phase === "late"
            ? "Because it’s late, long tasks are split into shorter focus blocks and quick urgent wins move up."
            : energy === "low"
                ? "Low-energy mode favors shorter tasks when their urgency is similar."
                : energy === "high"
                    ? "High-energy mode uses longer focus blocks and moves harder work earlier when deadlines are close."
                    : "Balanced mode avoids spending the entire session on one large task unless it is truly urgent.";

    return `${first} ${second}`;
}

function createSmartPlanSubjectLink(item) {
    const url =
        normalizeUrl(
            subjects[
                item.subject
            ]?.classroomUrl
        );

    if (!url) {
        return make(
            "span",
            "smart-plan-step-subject",
            item.subject
        );
    }

    const link =
        make(
            "a",
            "smart-plan-step-subject",
            item.subject
        );

    link.href = url;
    link.target = "_blank";
    link.rel =
        "noopener noreferrer";

    return link;
}

function renderSmartPlanTimeline(plan) {
    dom.smartPlanTimeline.innerHTML =
        "";

    if (!plan.schedule.length) {
        const empty =
            make(
                "div",
                "smart-plan-empty"
            );

        empty.append(
            make(
                "strong",
                "",
                "You’re clear."
            ),

            make(
                "span",
                "",
                "There are no open assignments or nearby exams/quizzes that need a study block."
            )
        );

        dom.smartPlanTimeline.append(
            empty
        );

        return;
    }

    for (
        const item of
        plan.schedule
    ) {
        if (
            item.kind === "break"
        ) {
            const row =
                make(
                    "div",
                    "smart-plan-step break"
                );

            row.append(
                make(
                    "div",
                    "smart-plan-step-time",
                    `${formatPlanClock(
                        item.start
                    )}–${formatPlanClock(
                        item.end
                    )}`
                ),

                make(
                    "div",
                    "smart-plan-step-main",
                    `Break · ${item.minutes} min`
                )
            );

            dom.smartPlanTimeline.append(
                row
            );

            continue;
        }

        const row =
            make(
                "div",
                "smart-plan-step"
            );

        row.style.setProperty(
            "--plan-color",
            item.color
        );

        const main =
            make(
                "div",
                "smart-plan-step-main"
            );

        const actions =
            make(
                "div",
                "smart-plan-step-actions"
            );

        main.append(
            createSmartPlanSubjectLink(
                item
            ),

            make(
                "h3",
                "smart-plan-step-title",
                item.title
            ),

            make(
                "p",
                "smart-plan-step-meta",
                smartPlanReason(
                    item,
                    item.plannedMinutes
                )
            )
        );

        const custom =
            normalizeUrl(
                item.entry?.customUrl
            );

        if (custom) {
            const link =
                make(
                    "a",
                    "smart-plan-step-link",
                    "Open link"
                );

            link.href = custom;
            link.target = "_blank";
            link.rel =
                "noopener noreferrer";

            actions.append(link);
        }

        if (
            [
                "assignment",
                "project"
            ].includes(
                item.kind
            )
        ) {
            const done =
                make(
                    "button",
                    "smart-plan-step-button done",
                    "Done"
                );

            done.type =
                "button";

            done.addEventListener(
                "click",
                async () => {
                    done.disabled =
                        true;

                    done.textContent =
                        "Saving…";

                    try {
                        await setCompleted(
                            item.entry,
                            true,
                            true
                        );

                        generateAndRenderSmartPlan();

                    } catch (error) {
                        console.error(error);

                        done.disabled =
                            false;

                        done.textContent =
                            "Done";
                    }
                }
            );

            actions.append(done);
        }

        row.append(
            make(
                "div",
                "smart-plan-step-time",
                `${formatPlanClock(
                    item.start
                )}–${formatPlanClock(
                    item.end
                )}`
            ),

            main,
            actions
        );

        dom.smartPlanTimeline.append(
            row
        );
    }
}

function renderSmartPlanLeftover(plan) {
    const unique =
        new Map();

    for (
        const candidate of
        plan.leftoverCandidates
    ) {
        unique.set(
            candidate.key,
            (
                unique.get(
                    candidate.key
                ) || 0
            ) +
            candidate.remainingMinutes
        );
    }

    const minutes =
        [
            ...unique.values()
        ].reduce(
            (total, value) =>
                total + value,
            0
        );

    if (minutes > 0) {
        dom.smartPlanLeftover.hidden =
            false;

        dom.smartPlanLeftover.textContent =
            `After this plan, about ${formatPlannerDuration(
                minutes
            )} of lower-priority or unfinished work is still outside the schedule across ${unique.size} item${
                unique.size === 1
                    ? ""
                    : "s"
            }.`;

        return;
    }

    if (
        plan.freeMinutes >= 10
    ) {
        dom.smartPlanLeftover.hidden =
            false;

        dom.smartPlanLeftover.textContent =
            `You have about ${formatPlannerDuration(
                plan.freeMinutes
            )} left over after everything currently worth planning fits.`;

        return;
    }

    dom.smartPlanLeftover.hidden =
        true;

    dom.smartPlanLeftover.textContent =
        "";
}

function generateAndRenderSmartPlan() {
    const profile =
        getSmartPlanProfile();

    const total =
        Number(
            dom.smartPlanDurationSlider.value
        );

    const energy =
        smartPlanState.energy;

    const includeBreaks =
        dom.smartPlanBreaks.checked;

    const includeStudy =
        dom.smartPlanStudy.checked;

    smartPlanState = {
        ...smartPlanState,
        minutes: total,
        includeBreaks,
        includeStudy
    };

    localStorage.setItem(
        "planner-smart-plan-options",
        JSON.stringify({
            includeBreaks,
            includeStudy
        })
    );

    const plan =
        createSmartPlanSchedule(
            total,
            profile,
            energy,
            includeBreaks,
            includeStudy
        );

    smartPlanState.lastPlan =
        plan;

    renderSmartPlanSummary(
        plan
    );

    dom.smartPlanInsight.textContent =
        buildSmartPlanInsight(
            plan,
            profile,
            energy
        );

    renderSmartPlanTimeline(
        plan
    );

    renderSmartPlanLeftover(
        plan
    );

    dom.smartPlanControls.hidden =
        true;

    dom.smartPlanResults.hidden =
        false;
}

function openSmartPlanDialog() {
    const profile =
        getSmartPlanProfile();

    const recommended =
        calculateRecommendedPlanMinutes(
            profile
        );

    updateSmartPlanButton();

    dom.smartPlanTitle.textContent =
        profile.title;

    dom.smartPlanDaypartBadge.textContent =
        profile.badge;

    dom.smartPlanSubtitle.textContent =
        profile.subtitle;

    dom.smartPlanDurationSlider.value =
        String(recommended);

    dom.smartPlanDurationHint.textContent =
        `Smart suggestion: ${formatPlannerDuration(
            recommended
        )}. You can change it before building the plan.`;

    setSmartPlanEnergy(
        profile.defaultEnergy
    );

    try {
        const saved =
            JSON.parse(
                localStorage.getItem(
                    "planner-smart-plan-options"
                ) || "{}"
            );

        dom.smartPlanBreaks.checked =
            saved.includeBreaks ??
            true;

        dom.smartPlanStudy.checked =
            saved.includeStudy ??
            true;

    } catch {
        dom.smartPlanBreaks.checked =
            true;

        dom.smartPlanStudy.checked =
            true;
    }

    updateSmartPlanDurationUI();

    dom.smartPlanControls.hidden =
        false;

    dom.smartPlanResults.hidden =
        true;

    dom.smartPlanDialog.showModal();
}

function closeSmartPlanDialog() {
    if (
        dom.smartPlanDialog.open
    ) {
        dom.smartPlanDialog.close();
    }
}

dom.smartPlanButton?.addEventListener(
    "click",
    openSmartPlanDialog
);

dom.closeSmartPlan?.addEventListener(
    "click",
    closeSmartPlanDialog
);

dom.finishSmartPlan?.addEventListener(
    "click",
    closeSmartPlanDialog
);

dom.smartPlanDialog?.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            dom.smartPlanDialog
        ) {
            closeSmartPlanDialog();
        }
    }
);

dom.smartPlanDurationSlider?.addEventListener(
    "input",
    updateSmartPlanDurationUI
);

$$(
    ".smart-plan-duration-button",
    dom.smartPlanDurationPresets
).forEach(button => {
    button.addEventListener(
        "click",
        () => {
            dom.smartPlanDurationSlider.value =
                button.dataset.minutes;

            updateSmartPlanDurationUI();
        }
    );
});

$$(
    ".smart-plan-energy-button",
    dom.smartPlanEnergyOptions
).forEach(button => {
    button.addEventListener(
        "click",
        () =>
            setSmartPlanEnergy(
                button.dataset.value
            )
    );
});

dom.generateSmartPlan?.addEventListener(
    "click",
    generateAndRenderSmartPlan
);

dom.rebuildSmartPlan?.addEventListener(
    "click",
    () => {
        dom.smartPlanResults.hidden =
            true;

        dom.smartPlanControls.hidden =
            false;
    }
);
