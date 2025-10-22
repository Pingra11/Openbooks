let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDate = new Date();
let isDateManuallySelected = false;

function openCalendarPicker() {
  const modal = document.getElementById('calendarPickerModal');
  if (modal) {
    modal.classList.add('active');
    renderCalendar();
  }
}

function closeCalendarPicker() {
  const modal = document.getElementById('calendarPickerModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function previousMonth() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderCalendar();
}

function selectDate(day) {
  selectedDate = new Date(currentYear, currentMonth, day);
  isDateManuallySelected = true;
  updateCurrentDateDisplay();
  closeCalendarPicker();
}

function updateCurrentDateDisplay() {
  const dateElement = document.getElementById('currentDate');
  if (dateElement && selectedDate) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = selectedDate.toLocaleDateString('en-US', options);
  }
}

function getDisplayDate() {
  return isDateManuallySelected && selectedDate ? selectedDate : new Date();
}

function renderCalendar() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  const monthYearElement = document.getElementById('calendarMonthYear');
  if (monthYearElement) {
    monthYearElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  const daysContainer = document.getElementById('calendarDays');
  if (!daysContainer) return;

  daysContainer.innerHTML = '';

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayLabels.forEach(label => {
    const dayLabel = document.createElement('div');
    dayLabel.className = 'calendar-day-label';
    dayLabel.textContent = label;
    daysContainer.appendChild(dayLabel);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day other-month';
    dayElement.textContent = daysInPrevMonth - i;
    daysContainer.appendChild(dayElement);
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;
    
    if (day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      dayElement.classList.add('today');
    }
    
    if (day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear()) {
      dayElement.classList.add('selected');
    }
    
    dayElement.onclick = () => selectDate(day);
    daysContainer.appendChild(dayElement);
  }

  const totalCells = daysContainer.children.length - 7;
  const remainingCells = 42 - totalCells - 7;
  for (let i = 1; i <= remainingCells; i++) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day other-month';
    dayElement.textContent = i;
    daysContainer.appendChild(dayElement);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarWidget = document.querySelector('.calendar-widget-below-header');
  if (calendarWidget) {
    calendarWidget.addEventListener('click', openCalendarPicker);
  }

  const modal = document.getElementById('calendarPickerModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeCalendarPicker();
      }
    });
  }
});
