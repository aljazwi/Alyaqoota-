// app.js

// Global state
let currentShiftId = null;

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await initDB();
        console.log("Database initialized successfully.");
        await checkActiveShift();
        await renderSetupTable();
    } catch (e) {
        console.error("Initialization failed:", e);
    }
});

// Navigation
function showSection(sectionId) {
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(sec => sec.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';

    if (sectionId === 'shift') {
        renderShiftTable();
    } else if (sectionId === 'reports') {
        generateReport();
    }
}

// --------------------------------------------------------------------------
// 1. الإعداد الأولي (First Setup)
// --------------------------------------------------------------------------

async function renderSetupTable() {
    const tbody = document.getElementById('setup-tbody');
    tbody.innerHTML = '';

    const pumps = await getAllData('pumps');
    pumps.forEach(pump => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${pump.id}</td>
            <td>${pump.type === 'gasoline' ? 'بنزين' : 'ديزل'}</td>
            <td>
                <input type="number" id="old-reading-${pump.id}" value="${pump.old_reading || 0}" ${pump.is_setup ? 'readonly' : ''} step="0.01">
            </td>
            <td>
                <input type="number" id="cur-reading-${pump.id}" value="${pump.current_reading || 0}" ${pump.is_setup ? 'readonly' : ''} step="0.01">
            </td>
            <td>
                <button onclick="saveSetup('${pump.id}')" ${pump.is_setup ? 'disabled' : ''}>حفظ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveSetup(pumpId) {
    const oldReadingInput = document.getElementById(`old-reading-${pumpId}`).value;
    const curReadingInput = document.getElementById(`cur-reading-${pumpId}`).value;

    const oldR = parseFloat(oldReadingInput);
    const curR = parseFloat(curReadingInput);

    if (isNaN(oldR) || isNaN(curR) || oldR < 0 || curR < oldR) {
        alert("يرجى إدخال قراءات صحيحة (الحالية يجب أن تكون أكبر من أو تساوي القديمة).");
        return;
    }

    const pump = await getData('pumps', pumpId);

    const oldData = { ...pump };

    pump.old_reading = oldR;
    pump.current_reading = curR;
    pump.is_setup = true;

    await putData('pumps', pump);
    await logAudit('pumps', pumpId, 'FIRST_SETUP', oldData, pump, 'Admin');

    alert(`تم حفظ الإعداد للمضخة ${pumpId} بنجاح.`);
    renderSetupTable();
}

// --------------------------------------------------------------------------
// 2. إدارة الورديات وإغلاق المضخات (Shift & Variance Accounting)
// --------------------------------------------------------------------------

async function checkActiveShift() {
    const shifts = await getAllData('shifts');
    const openShift = shifts.find(s => s.status === 'open');
    if (openShift) {
        currentShiftId = openShift.id;
        document.getElementById('shift-status').innerText = `وردية مفتوحة (رقم: ${currentShiftId})`;
        document.getElementById('shift-operations').style.display = 'block';
        document.getElementById('btn-open-shift').style.display = 'none';
        document.getElementById('btn-close-group').style.display = 'inline-block';
    } else {
        currentShiftId = null;
        document.getElementById('shift-status').innerText = `لا توجد وردية مفتوحة حالياً.`;
        document.getElementById('shift-operations').style.display = 'none';
        document.getElementById('btn-open-shift').style.display = 'inline-block';
        document.getElementById('btn-close-group').style.display = 'none';
    }
}

async function openShift() {
    const pumps = await getAllData('pumps');
    const unSetupPumps = pumps.filter(p => !p.is_setup);
    if (unSetupPumps.length > 0) {
        alert("لا يمكن فتح وردية قبل استكمال الإعداد الأولي لجميع المضخات.");
        return;
    }

    const newShift = {
        timestamp_open: new Date().toISOString(),
        status: 'open',
        operator: 'Admin'
    };

    currentShiftId = await addData('shifts', newShift);

    // تسجيل القراءات الافتتاحية لكل مضخة
    for (const pump of pumps) {
        const reading = {
            shift_id: currentShiftId,
            pump_id: pump.id,
            opening_reading: pump.current_reading,
            closing_reading: null,
            expected_revenue: 0,
            actual_revenue: null,
            discount: 0,
            volume_variance: 0,
            cash_variance: 0,
            status: 'open'
        };
        await addData('shift_readings', reading);
    }

    checkActiveShift();
    renderShiftTable();
}

async function renderShiftTable() {
    if (!currentShiftId) return;

    const tbody = document.getElementById('shift-tbody');
    tbody.innerHTML = '';

    const pumps = await getAllData('pumps');
    const settingsGas = await getData('settings', 'gasoline_price');
    const settingsDiesel = await getData('settings', 'diesel_price');

    const allReadings = await getAllData('shift_readings');
    const currentReadings = allReadings.filter(r => r.shift_id === currentShiftId);

    for (const reading of currentReadings) {
        const pump = pumps.find(p => p.id === reading.pump_id);
        const price = pump.type === 'gasoline' ? settingsGas.value : settingsDiesel.value;
        const isClosed = reading.status === 'closed';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${pump.id} (${pump.type === 'gasoline' ? 'بنزين' : 'ديزل'})</td>
            <td>${reading.opening_reading.toFixed(2)}</td>
            <td>
                <input type="number" id="shift-new-reading-${pump.id}" value="${reading.closing_reading || reading.opening_reading}" step="0.01" ${isClosed ? 'readonly' : ''} oninput="updateRowCalcs('${pump.id}', ${reading.opening_reading}, ${price})">
            </td>
            <td id="shift-vol-${pump.id}">${isClosed ? (reading.closing_reading - reading.opening_reading).toFixed(2) : '0.00'}</td>
            <td id="shift-exp-rev-${pump.id}">${isClosed ? reading.expected_revenue.toFixed(2) : '0.00'}</td>
            <td>
                <input type="number" id="shift-act-rev-${pump.id}" value="${reading.actual_revenue !== null ? reading.actual_revenue : ''}" step="0.01" ${isClosed ? 'readonly' : ''} placeholder="المبلغ المحصل">
            </td>
            <td>
                ${isClosed ? '<span class="btn-success" style="padding: 5px; border-radius:3px; color:white;">مغلق</span>' : `<button onclick="closePump('${reading.id}', '${pump.id}', ${reading.opening_reading}, ${price})">إغلاق</button>`}
            </td>
        `;
        tbody.appendChild(tr);
    }
}

window.updateRowCalcs = function(pumpId, openingReading, pricePerLiter) {
    const newReading = parseFloat(document.getElementById(`shift-new-reading-${pumpId}`).value);
    const volElem = document.getElementById(`shift-vol-${pumpId}`);
    const expRevElem = document.getElementById(`shift-exp-rev-${pumpId}`);

    const vol = calculateExpectedVolume(openingReading, newReading);
    const expRev = calculateExpectedRevenue(vol, pricePerLiter);

    volElem.innerText = vol.toFixed(2);
    expRevElem.innerText = expRev.toFixed(2);
}

window.closePump = async function(readingId, pumpId, openingReading, pricePerLiter) {
    const newReading = parseFloat(document.getElementById(`shift-new-reading-${pumpId}`).value);
    const actualRev = parseFloat(document.getElementById(`shift-act-rev-${pumpId}`).value);

    if (isNaN(newReading) || newReading < openingReading) {
        alert("القراءة الجديدة غير صحيحة.");
        return;
    }
    if (isNaN(actualRev)) {
        alert("يرجى إدخال الإيراد الفعلي.");
        return;
    }

    const vol = calculateExpectedVolume(openingReading, newReading);
    const expRev = calculateExpectedRevenue(vol, pricePerLiter);

    const cashVariance = actualRev - expRev;

    const limitSetting = await getData('settings', 'variance_limit_percent');
    const variancePercent = expRev > 0 ? Math.abs(cashVariance) / expRev * 100 : 0;

    if (variancePercent > limitSetting.value) {
         if (!confirm(`تحذير: نسبة الانحراف (${variancePercent.toFixed(2)}%) تتجاوز الحد المسموح. هل تريد المتابعة؟`)) {
             return;
         }
    }

    // Update Reading
    readingId = parseInt(readingId);
    const reading = await getData('shift_readings', readingId);
    const oldReadingData = { ...reading };

    reading.closing_reading = newReading;
    reading.expected_revenue = expRev;
    reading.actual_revenue = actualRev;
    reading.cash_variance = cashVariance;
    reading.status = 'closed';

    await putData('shift_readings', reading);
    await logAudit('shift_readings', reading.id, 'CLOSE_PUMP', oldReadingData, reading, 'Admin');

    // Update Pump
    const pump = await getData('pumps', pumpId);
    const oldPumpData = { ...pump };
    pump.current_reading = newReading;
    await putData('pumps', pump);
    await logAudit('pumps', pumpId, 'UPDATE_READING_FROM_SHIFT', oldPumpData, pump, 'Admin');

    alert(`تم إغلاق المضخة ${pumpId} بنجاح. الفارق النقدي: ${cashVariance.toFixed(2)}`);
    renderShiftTable();
}

async function closeGroupShift() {
    if (!currentShiftId) return;

    const allReadings = await getAllData('shift_readings');
    const currentReadings = allReadings.filter(r => r.shift_id === currentShiftId);

    const unclosed = currentReadings.filter(r => r.status !== 'closed');
    if (unclosed.length > 0) {
        alert("يرجى إغلاق جميع المضخات أولاً قبل الإغلاق الجماعي.");
        return;
    }

    let totalExp = 0;
    let totalAct = 0;
    let totalCashVar = 0;
    let totalVol = 0;

    for (const r of currentReadings) {
        totalExp += r.expected_revenue;
        totalAct += r.actual_revenue;
        totalCashVar += r.cash_variance;
        totalVol += (r.closing_reading - r.opening_reading);
    }

    const groupClosure = {
        shift_id: currentShiftId,
        total_expected: totalExp,
        total_actual: totalAct,
        total_cash_variance: totalCashVar,
        total_volume_variance: 0, // Simplified for this scope
        timestamp: new Date().toISOString(),
        operator: 'Admin'
    };

    await addData('group_closures', groupClosure);

    // Add to daily ledger
    await addData('daily_ledger', {
        date: new Date().toISOString().split('T')[0],
        entry_type: 'credit',
        amount: totalAct,
        category: 'Fuel Sales',
        reference_id: currentShiftId,
        timestamp: new Date().toISOString()
    });

    // Close shift
    const shift = await getData('shifts', currentShiftId);
    shift.status = 'closed';
    shift.timestamp_close = new Date().toISOString();
    await putData('shifts', shift);

    alert("تم الإغلاق الجماعي للوردية بنجاح وتم ترحيل الإيرادات لدفتر الأستاذ.");
    checkActiveShift();
}

// --------------------------------------------------------------------------
// 3. الإيرادات والمصروفات الأخرى (Other Income & Expenses)
// --------------------------------------------------------------------------

window.addOtherIncome = async function(event) {
    event.preventDefault();
    const type = document.getElementById('inc-type').value;
    const amount = parseFloat(document.getElementById('inc-amount').value);
    const desc = document.getElementById('inc-desc').value;

    if (!type || isNaN(amount) || amount <= 0) return;

    const income = { date: new Date().toISOString().split('T')[0], type, amount, description: desc };
    const id = await addData('other_incomes', income);

    await addData('daily_ledger', {
        date: income.date, entry_type: 'credit', amount, category: type, reference_id: id, timestamp: new Date().toISOString()
    });

    alert("تم إضافة الإيراد بنجاح.");
    document.getElementById('form-income').reset();
};

window.addExpense = async function(event) {
    event.preventDefault();
    const type = document.getElementById('exp-type').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const desc = document.getElementById('exp-desc').value;

    if (!type || isNaN(amount) || amount <= 0) return;

    const expense = { date: new Date().toISOString().split('T')[0], type, amount, description: desc };
    const id = await addData('expenses', expense);

    await addData('daily_ledger', {
        date: expense.date, entry_type: 'debit', amount, category: type, reference_id: id, timestamp: new Date().toISOString()
    });

    alert("تم إضافة المصروف بنجاح.");
    document.getElementById('form-expense').reset();
};

// --------------------------------------------------------------------------
// 4. التقارير اليومية (Reports)
// --------------------------------------------------------------------------

window.generateReport = async function() {
    const todayDate = new Date().toISOString().split('T')[0];
    const ledger = await getAllData('daily_ledger');

    // Filter for today
    const todayLedger = ledger.filter(entry => entry.date === todayDate);

    let fuelRevenue = 0;
    let otherRevenue = 0;
    let totalExpenses = 0;

    todayLedger.forEach(entry => {
        if (entry.entry_type === 'credit') {
            if (entry.category === 'Fuel Sales') {
                fuelRevenue += entry.amount;
            } else {
                otherRevenue += entry.amount;
            }
        } else if (entry.entry_type === 'debit') {
            totalExpenses += entry.amount;
        }
    });

    const grossIncome = fuelRevenue + otherRevenue;
    const netProfit = grossIncome - totalExpenses;

    const reportHtml = `
        <div class="report-card">
            <h3>تقرير اليوم: ${todayDate}</h3>
            <div class="flex-row">
                <span>إجمالي إيرادات الوقود المحصلة:</span>
                <span>${fuelRevenue.toFixed(2)}</span>
            </div>
            <div class="flex-row">
                <span>إجمالي إيرادات أخرى:</span>
                <span>${otherRevenue.toFixed(2)}</span>
            </div>
            <div class="flex-row" style="border-bottom: 1px solid #dee2e6; padding-bottom: 10px; margin-bottom: 10px;">
                <strong>الإجمالي العام للإيرادات:</strong>
                <strong>${grossIncome.toFixed(2)}</strong>
            </div>
            <div class="flex-row" style="color: #dc3545;">
                <span>إجمالي المصروفات:</span>
                <span>${totalExpenses.toFixed(2)}</span>
            </div>
            <div class="flex-row" style="background-color: #e9ecef; padding: 10px; border-radius: 4px; margin-top: 10px;">
                <strong>صافي الربح:</strong>
                <strong>${netProfit.toFixed(2)}</strong>
            </div>
        </div>
    `;

    document.getElementById('report-output').innerHTML = reportHtml;
}

// --------------------------------------------------------------------------
// Helper: Smart Meter Calculations
// --------------------------------------------------------------------------
function calculateExpectedVolume(openingReading, newReading) {
    if (isNaN(openingReading) || isNaN(newReading) || newReading < openingReading) {
        return 0;
    }
    return newReading - openingReading;
}

function calculateExpectedRevenue(volume, pricePerLiter) {
    return volume * pricePerLiter;
}
