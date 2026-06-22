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
    } else if (sectionId === 'settings-sec') {
        loadSettings();
    }
}

// --------------------------------------------------------------------------
// 0. الإعدادات (Settings)
// --------------------------------------------------------------------------

async function loadSettings() {
    const gasBuy = await getData('settings', 'gasoline_buy_price');
    const gasSell = await getData('settings', 'gasoline_sell_price');
    const dieselBuy = await getData('settings', 'diesel_buy_price');
    const dieselSell = await getData('settings', 'diesel_sell_price');

    if (gasBuy) document.getElementById('set-gas-buy').value = gasBuy.value;
    if (gasSell) document.getElementById('set-gas-sell').value = gasSell.value;
    if (dieselBuy) document.getElementById('set-diesel-buy').value = dieselBuy.value;
    if (dieselSell) document.getElementById('set-diesel-sell').value = dieselSell.value;
}

window.saveSettings = async function(event) {
    event.preventDefault();
    const gasBuy = parseFloat(document.getElementById('set-gas-buy').value);
    const gasSell = parseFloat(document.getElementById('set-gas-sell').value);
    const dieselBuy = parseFloat(document.getElementById('set-diesel-buy').value);
    const dieselSell = parseFloat(document.getElementById('set-diesel-sell').value);

    await putData('settings', { key: 'gasoline_buy_price', value: gasBuy });
    await putData('settings', { key: 'gasoline_sell_price', value: gasSell });
    await putData('settings', { key: 'diesel_buy_price', value: dieselBuy });
    await putData('settings', { key: 'diesel_sell_price', value: dieselSell });

    alert("تم حفظ الإعدادات بنجاح.");
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
    const settingsGasSell = await getData('settings', 'gasoline_sell_price');
    const settingsDieselSell = await getData('settings', 'diesel_sell_price');

    const allReadings = await getAllData('shift_readings');
    const currentReadings = allReadings.filter(r => r.shift_id === currentShiftId);

    for (const reading of currentReadings) {
        const pump = pumps.find(p => p.id === reading.pump_id);
        const price = pump.type === 'gasoline' ? settingsGasSell.value : settingsDieselSell.value;
        const isClosed = reading.status === 'closed';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="checkbox" class="pump-select" value="${pump.id}" data-reading-id="${reading.id}" data-opening="${reading.opening_reading}" data-price="${price}" data-type="${pump.type}" ${isClosed ? 'disabled' : ''}>
            </td>
            <td>${pump.id} (${pump.type === 'gasoline' ? 'بنزين' : 'ديزل'})</td>
            <td>${reading.opening_reading.toFixed(2)}</td>
            <td>
                <input type="number" id="shift-new-reading-${pump.id}" value="${reading.closing_reading || reading.opening_reading}" step="0.01" ${isClosed ? 'readonly' : ''} oninput="updateRowCalcs('${pump.id}', ${reading.opening_reading}, ${price})">
            </td>
            <td id="shift-vol-${pump.id}">${isClosed ? (reading.closing_reading - reading.opening_reading).toFixed(2) : '0.00'}</td>
            <td id="shift-exp-rev-${pump.id}">${isClosed ? reading.expected_revenue.toFixed(2) : '0.00'}</td>
            <td>
                ${isClosed ? '<span class="btn-success" style="padding: 5px; border-radius:3px; color:white;">مغلق</span>' : '<span style="color:red">مفتوح</span>'}
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

window.closeSelectedPumps = async function() {
    const operatorName = document.getElementById('operator-name').value;
    const actualRev = parseFloat(document.getElementById('group-actual-rev').value);

    if (!operatorName) {
        alert("يرجى إدخال اسم الموظف.");
        return;
    }

    if (isNaN(actualRev)) {
        alert("يرجى إدخال الإيراد الفعلي الكلي.");
        return;
    }

    const checkboxes = document.querySelectorAll('.pump-select:checked');
    if (checkboxes.length === 0) {
        alert("يرجى تحديد مضخة واحدة على الأقل.");
        return;
    }

    let totalExpectedRev = 0;
    let totalFuelCost = 0;

    const gasBuy = await getData('settings', 'gasoline_buy_price');
    const dieselBuy = await getData('settings', 'diesel_buy_price');

    const updates = [];

    for (const cb of checkboxes) {
        const pumpId = cb.value;
        const readingId = parseInt(cb.dataset.readingId);
        const openingReading = parseFloat(cb.dataset.opening);
        const pricePerLiter = parseFloat(cb.dataset.price);
        const pumpType = cb.dataset.type;

        const newReading = parseFloat(document.getElementById(`shift-new-reading-${pumpId}`).value);

        if (isNaN(newReading) || newReading < openingReading) {
            alert(`القراءة الجديدة للمضخة ${pumpId} غير صحيحة.`);
            return;
        }

        const vol = calculateExpectedVolume(openingReading, newReading);
        const expRev = calculateExpectedRevenue(vol, pricePerLiter);

        const costPrice = pumpType === 'gasoline' ? gasBuy.value : dieselBuy.value;
        const fuelCost = vol * costPrice;

        totalExpectedRev += expRev;
        totalFuelCost += fuelCost;

        updates.push({
            readingId,
            pumpId,
            newReading,
            expRev
        });
    }

    const cashVariance = actualRev - totalExpectedRev;

    // Distribute the actual revenue and variance proportionally based on expected revenue
    // to preserve individual pump audit trails.
    let remainingActual = actualRev;
    let remainingVariance = cashVariance;

    for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        const isLast = i === updates.length - 1;

        let pumpActual = 0;
        let pumpVariance = 0;

        if (totalExpectedRev > 0) {
             const ratio = u.expRev / totalExpectedRev;
             pumpActual = isLast ? remainingActual : parseFloat((actualRev * ratio).toFixed(2));
             pumpVariance = isLast ? remainingVariance : parseFloat((cashVariance * ratio).toFixed(2));
        } else {
             // Edge case: total expected revenue is 0, but we somehow have actual revenue
             pumpActual = isLast ? remainingActual : 0;
             pumpVariance = isLast ? remainingVariance : 0;
        }

        remainingActual -= pumpActual;
        remainingVariance -= pumpVariance;

        const reading = await getData('shift_readings', u.readingId);
        reading.closing_reading = u.newReading;
        reading.expected_revenue = u.expRev;
        reading.actual_revenue = pumpActual;
        reading.cash_variance = pumpVariance;
        reading.status = 'closed';
        reading.operator = operatorName;
        await putData('shift_readings', reading);

        const pump = await getData('pumps', u.pumpId);
        pump.current_reading = u.newReading;
        await putData('pumps', pump);
    }

    // Add grouped actual revenue to daily ledger
    await addData('daily_ledger', {
        date: new Date().toISOString().split('T')[0],
        entry_type: 'credit',
        amount: actualRev,
        category: `Fuel Sales (${operatorName})`,
        reference_id: currentShiftId,
        timestamp: new Date().toISOString()
    });

    // Add fuel cost to daily ledger
    await addData('daily_ledger', {
        date: new Date().toISOString().split('T')[0],
        entry_type: 'debit',
        amount: totalFuelCost,
        category: `Cost of Goods Sold (${operatorName})`,
        reference_id: currentShiftId,
        timestamp: new Date().toISOString()
    });

    alert(`تم إغلاق المضخات بنجاح. إجمالي المتوقع: ${totalExpectedRev.toFixed(2)}, الفارق: ${cashVariance.toFixed(2)}`);
    document.getElementById('group-actual-rev').value = '';
    renderShiftTable();
}

async function closeGroupShift() {
    if (!currentShiftId) return;

    const allReadings = await getAllData('shift_readings');
    const currentReadings = allReadings.filter(r => r.shift_id === currentShiftId);

    const unclosed = currentReadings.filter(r => r.status !== 'closed');
    if (unclosed.length > 0) {
        alert("يرجى إغلاق جميع المضخات أولاً قبل إغلاق الوردية.");
        return;
    }

    let totalExp = 0;
    let totalAct = 0;
    let totalCashVar = 0;

    for (const r of currentReadings) {
        totalExp += r.expected_revenue;
        totalAct += r.actual_revenue;
        totalCashVar += r.cash_variance;
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

    // Note: We no longer add to daily_ledger here, because individual or grouped pump closures
    // (via closeSelectedPumps) already post to the daily_ledger to attribute to specific operators.

    // Close shift
    const shift = await getData('shifts', currentShiftId);
    shift.status = 'closed';
    shift.timestamp_close = new Date().toISOString();
    await putData('shifts', shift);

    alert("تم إغلاق الوردية بنجاح.");
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
    let fuelCost = 0;
    let otherRevenue = 0;
    let totalExpenses = 0;

    todayLedger.forEach(entry => {
        if (entry.entry_type === 'credit') {
            if (entry.category && entry.category.startsWith('Fuel Sales')) {
                fuelRevenue += entry.amount;
            } else {
                otherRevenue += entry.amount;
            }
        } else if (entry.entry_type === 'debit') {
            if (entry.category && entry.category.startsWith('Cost of Goods Sold')) {
                fuelCost += entry.amount;
            } else {
                totalExpenses += entry.amount;
            }
        }
    });

    const grossIncome = fuelRevenue + otherRevenue;
    const netProfit = grossIncome - totalExpenses - fuelCost;

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
                <span>تكلفة الوقود المباع (Cost of Goods Sold):</span>
                <span>${fuelCost.toFixed(2)}</span>
            </div>
            <div class="flex-row" style="color: #dc3545;">
                <span>إجمالي المصروفات الأخرى:</span>
                <span>${totalExpenses.toFixed(2)}</span>
            </div>
            <div class="flex-row" style="background-color: #e9ecef; padding: 10px; border-radius: 4px; margin-top: 10px;">
                <strong>صافي الربح الفعلي:</strong>
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
