const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const browseButton = document.getElementById('browseButton');

const agentSection = document.getElementById('agent-section');
const agentSelect = document.getElementById('agentSelect');

const formatSection = document.getElementById('format-section');
const generateButton = document.getElementById('generateButton');
const statusMessage = document.getElementById('statusMessage');

let csvRows = [];


/* --------------------------------
   File selection
-------------------------------- */

browseButton.addEventListener('click', (event) => {
  event.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});


/* --------------------------------
   Drag and drop
-------------------------------- */

['dragenter', 'dragover'].forEach(type => {
  dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach(type => {
  dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
});

dropZone.addEventListener('drop', event => {
  const files = event.dataTransfer.files;

  if (files.length) {
    handleFile(files[0]);
  }
});


/* --------------------------------
   File input
-------------------------------- */

fileInput.addEventListener('change', event => {
  if (event.target.files.length) {
    handleFile(event.target.files[0]);
  }
});


/* --------------------------------
   Agent selection
-------------------------------- */

agentSelect.addEventListener('change', () => {
  const selectedAgent = agentSelect.value;

  formatSection.hidden = !selectedAgent;

  generateButton.disabled = !selectedAgent;

  statusMessage.textContent = selectedAgent
    ? `${countAgentDates(selectedAgent)} calendar event(s) ready to generate.`
    : '';
});


/* --------------------------------
   Generate calendar
-------------------------------- */

generateButton.addEventListener('click', () => {
  generateCalendarFile();
});


/* --------------------------------
   Read uploaded file
-------------------------------- */

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    alert('Please select a CSV file.');
    return;
  }

  const reader = new FileReader();

  reader.onload = event => {
    try {
      csvRows = parseCsv(event.target.result);

      const agents = [
        ...new Set(
          csvRows
            .map(row => row['Agent Name'])
            .filter(Boolean)
        )
      ];

      if (!agents.length) {
        throw new Error(
          'No Agent Name values were found in the CSV.'
        );
      }

      agentSelect.innerHTML =
        '<option value="">Select an agent</option>';

      agents.forEach(agent => {
        const option = document.createElement('option');

        option.value = agent;
        option.textContent = agent;

        agentSelect.appendChild(option);
      });

      agentSection.hidden = false;
      formatSection.hidden = true;

      generateButton.disabled = true;
      statusMessage.textContent = '';

      agentSection.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    } catch (error) {
      csvRows = [];

      agentSection.hidden = true;
      formatSection.hidden = true;

      alert(
        `Could not read the CSV file. ${error.message}`
      );
    }
  };

  reader.onerror = () => {
    alert('The CSV file could not be read.');
  };

  reader.readAsText(file, 'UTF-8');
}


/* --------------------------------
   CSV parser
-------------------------------- */

function parseCsv(text) {
  const rows = [];

  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {

      if (insideQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }

    } else if (char === ',' && !insideQuotes) {

      row.push(field);
      field = '';

    } else if (
      (char === '\n' || char === '\r') &&
      !insideQuotes
    ) {

      if (char === '\r' && next === '\n') {
        i++;
      }

      row.push(field);
      field = '';

      if (
        row.some(value => value.trim() !== '')
      ) {
        rows.push(row);
      }

      row = [];

    } else {
      field += char;
    }
  }

  row.push(field);

  if (
    row.some(value => value.trim() !== '')
  ) {
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error(
      'The CSV contains no data rows.'
    );
  }

  const headers = rows[0].map(header =>
    header.trim()
  );

  const requiredHeaders = [
    'Agent Name',
    'Time zone',
    'Scheduled Date',
    'Type',
    'Activity Code',
    'Start Time',
    'End Time',
    'Paid Hours',
    'Duration',
    'Comments'
  ];

  const missingHeaders =
    requiredHeaders.filter(
      header => !headers.includes(header)
    );

  if (missingHeaders.length) {
    throw new Error(
      `Missing column(s): ${missingHeaders.join(', ')}`
    );
  }

  return rows.slice(1).map(values => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] =
        (values[index] ?? '').trim();
    });

    return object;
  });
}


/* --------------------------------
   Get first row for each date
-------------------------------- */

function getSelectedAgentDates(agent) {
  const selectedRows =
    csvRows.filter(
      row => row['Agent Name'] === agent
    );

  const seenDates = new Set();
  const firstRowForDate = [];

  for (const row of selectedRows) {
    const date = row['Scheduled Date'];

    if (!date || seenDates.has(date)) {
      continue;
    }

    seenDates.add(date);
    firstRowForDate.push(row);
  }

  return firstRowForDate;
}


function countAgentDates(agent) {
  return getSelectedAgentDates(agent).length;
}


/* --------------------------------
   Generate calendar file
-------------------------------- */

function generateCalendarFile() {
  const agent = agentSelect.value;

  const rows = getSelectedAgentDates(agent);

  if (!agent || !rows.length) {
    return;
  }

  const events = rows.map(row =>
    createEvent(row)
  );

  const calendar = buildCalendar(events);

  const safeAgent =
    agent.replace(/[^a-z0-9_-]+/gi, '_');

  downloadText(
    calendar,
    `${safeAgent}_schedule.ics`,
    'text/calendar;charset=utf-8'
  );

  statusMessage.textContent =
    `Generated ${events.length} event(s) for ${agent}.`;
}


/* --------------------------------
   Create calendar event
-------------------------------- */

function createEvent(row) {
  const start = parseCalendarStart(
    row['Scheduled Date'],
    row['Start Time']
  );

  const end = addOneHour(start);

  const timezone = row['Time zone'];

  return {
    summary: row['Activity Code'],
    timezone,
    startValue: start.value,
    endValue: end.value,

    uid:
      `${row['Agent Name']}-${row['Scheduled Date']}-${start.value}@schedule-generator`,

    timestamp:
      formatUtcTimestamp(new Date())
  };
}


/* --------------------------------
   Parse date and time
-------------------------------- */

function parseCalendarStart(dateText, timeText) {
  const dateMatch =
    dateText.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  const timeMatch =
    timeText.match(
      /^(\d{1,2}):(\d{2})(AM|PM)$/i
    );

  if (!dateMatch || !timeMatch) {
    throw new Error(
      `Invalid date or time: ${dateText} ${timeText}`
    );
  }

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem =
    timeMatch[3].toUpperCase();

  if (
    hour < 1 ||
    hour > 12 ||
    minute > 59
  ) {
    throw new Error(
      `Invalid time: ${timeText}`
    );
  }

  if (
    meridiem === 'AM' &&
    hour === 12
  ) {
    hour = 0;
  }

  if (
    meridiem === 'PM' &&
    hour !== 12
  ) {
    hour += 12;
  }

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour,
    minute,

    value:
      `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}T` +
      `${String(hour).padStart(2, '0')}` +
      `${String(minute).padStart(2, '0')}00`
  };
}


/* --------------------------------
   Add exactly one hour
-------------------------------- */

function addOneHour(start) {
  let hour = start.hour + 1;
  let day = start.day;
  let month = start.month;
  let year = start.year;

  if (hour === 24) {
    hour = 0;

    const nextDay =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day + 1
        )
      );

    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
  }

  const pad = value =>
    String(value).padStart(2, '0');

  return {
    value:
      `${year}${pad(month)}${pad(day)}T` +
      `${pad(hour)}${pad(start.minute)}00`
  };
}


/* --------------------------------
   UTC timestamp
-------------------------------- */

function formatUtcTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}


/* --------------------------------
   Build iCalendar
-------------------------------- */

function buildCalendar(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedule Generator//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  events.forEach(event => {
    lines.push('BEGIN:VEVENT');

    lines.push(
      `UID:${event.uid}`
    );

    lines.push(
      `DTSTAMP:${event.timestamp}`
    );

    lines.push(
      `SUMMARY:${escapeCalendarText(event.summary)}`
    );

    lines.push(
      `DTSTART;TZID=${escapeCalendarText(event.timezone)}:${event.startValue}`
    );

    lines.push(
      `DTEND;TZID=${escapeCalendarText(event.timezone)}:${event.endValue}`
    );

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}


/* --------------------------------
   Escape iCalendar text
-------------------------------- */

function escapeCalendarText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}


/* --------------------------------
   Download generated file
-------------------------------- */

function downloadText(content, filename, type) {
  const blob = new Blob(
    [content],
    { type }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}
