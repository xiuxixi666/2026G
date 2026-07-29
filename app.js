(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const defaults = {
    frequencyUnit: "kHz",
    amplitudeUnit: "mV",
    amplitudeMode: "peak",
    enableH1: true,
    enableH2: true,
    f1: 10.5,
    a1: 100,
    p1: 0,
    f2: 31.5,
    a2: 30,
    p2: 0,
    f3: 42,
    a3: 20,
    p3: 0
  };

  const elements = {
    frequencyUnit: $("frequencyUnit"),
    amplitudeUnit: $("amplitudeUnit"),
    amplitudeMode: $("amplitudeMode"),
    enableH1: $("enableH1"),
    enableH2: $("enableH2"),
    f1: $("f1"),
    a1: $("a1"),
    p1: $("p1"),
    f2: $("f2"),
    a2: $("a2"),
    p2: $("p2"),
    f3: $("f3"),
    a3: $("a3"),
    p3: $("p3"),
    calculate: $("calculate"),
    reset: $("reset"),
    loadExample: $("loadExample"),
    validationMessage: $("validationMessage"),
    vppValue: $("vppValue"),
    maxValue: $("maxValue"),
    minValue: $("minValue"),
    rmsValue: $("rmsValue"),
    vppUnit: $("vppUnit"),
    maxUnit: $("maxUnit"),
    minUnit: $("minUnit"),
    rmsUnit: $("rmsUnit"),
    waveformCanvas: $("waveformCanvas"),
    windowInfo: $("windowInfo"),
    calculationNote: $("calculationNote"),
    formula: $("formula"),
    spectrumBody: $("spectrumBody"),
    copyResult: $("copyResult"),
    periodButtons: Array.from(document.querySelectorAll(".period-button"))
  };

  let lastResult = null;
  let resizeTimer = null;
  let displayedPeriods = 1;

  const frequencyMultipliers = {
    Hz: 1,
    kHz: 1e3,
    MHz: 1e6
  };

  function getComponents() {
    const frequencyMultiplier = frequencyMultipliers[elements.frequencyUnit.value];
    const rmsInput = elements.amplitudeMode.value === "rms";
    const amplitudeToPeak = rmsInput ? Math.SQRT2 : 1;

    const raw = [
      {
        enabled: true,
        name: "基波",
        symbol: "U₁",
        frequency: Number(elements.f1.value) * frequencyMultiplier,
        displayFrequency: Number(elements.f1.value),
        inputAmplitude: Number(elements.a1.value),
        peakAmplitude: Number(elements.a1.value) * amplitudeToPeak,
        phaseDeg: Number(elements.p1.value)
      },
      {
        enabled: elements.enableH1.checked,
        name: "谐波 1",
        symbol: "U₃",
        frequency: Number(elements.f2.value) * frequencyMultiplier,
        displayFrequency: Number(elements.f2.value),
        inputAmplitude: Number(elements.a2.value),
        peakAmplitude: Number(elements.a2.value) * amplitudeToPeak,
        phaseDeg: Number(elements.p2.value)
      },
      {
        enabled: elements.enableH2.checked,
        name: "谐波 2",
        symbol: "U₄",
        frequency: Number(elements.f3.value) * frequencyMultiplier,
        displayFrequency: Number(elements.f3.value),
        inputAmplitude: Number(elements.a3.value),
        peakAmplitude: Number(elements.a3.value) * amplitudeToPeak,
        phaseDeg: Number(elements.p3.value)
      }
    ];

    return raw.filter((component) => component.enabled);
  }

  function validate(components) {
    for (const component of components) {
      if (!Number.isFinite(component.frequency) || component.frequency <= 0) {
        return `${component.name}的频率必须大于 0。`;
      }
      if (!Number.isFinite(component.inputAmplitude) || component.inputAmplitude < 0) {
        return `${component.name}的幅值必须是大于或等于 0 的数。`;
      }
      if (!Number.isFinite(component.phaseDeg)) {
        return `${component.name}的相位必须是有效数字。`;
      }
    }
    return "";
  }

  function gcdBigInt(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function estimateCommonPeriod(frequencies) {
    // 将频率量化到 1 µHz，再用整数最大公约数寻找公共周期。
    const scale = 1e6;
    const integers = frequencies.map((frequency) => {
      const scaled = Math.round(frequency * scale);
      if (!Number.isSafeInteger(scaled) || scaled <= 0) {
        return null;
      }
      return BigInt(scaled);
    });

    if (integers.some((value) => value === null)) {
      return { exactEnough: false, period: 5 / Math.min(...frequencies), cycleCount: null };
    }

    let gcd = integers[0];
    for (let i = 1; i < integers.length; i += 1) {
      gcd = gcdBigInt(gcd, integers[i]);
    }

    const gcdHz = Number(gcd) / scale;
    if (!Number.isFinite(gcdHz) || gcdHz <= 0) {
      return { exactEnough: false, period: 5 / Math.min(...frequencies), cycleCount: null };
    }

    const period = 1 / gcdHz;
    const maxFrequency = Math.max(...frequencies);
    const cycleCount = maxFrequency * period;

    // 对非整谐波组合，公共周期可能极长；此时改用最低频率的 5 个周期作为观察窗。
    if (!Number.isFinite(period) || cycleCount > 5000) {
      return { exactEnough: false, period: 5 / Math.min(...frequencies), cycleCount };
    }

    return { exactEnough: true, period, cycleCount };
  }

  function signalAt(t, components) {
    let value = 0;
    for (const component of components) {
      const phaseRad = component.phaseDeg * Math.PI / 180;
      value += component.peakAmplitude *
        Math.sin(2 * Math.PI * component.frequency * t + phaseRad);
    }
    return value;
  }

  function goldenExtremum(fn, left, right, maximize) {
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = left;
    let b = right;
    let c = b - ratio * (b - a);
    let d = a + ratio * (b - a);
    let fc = fn(c);
    let fd = fn(d);

    for (let i = 0; i < 70; i += 1) {
      const chooseLeft = maximize ? fc > fd : fc < fd;
      if (chooseLeft) {
        b = d;
        d = c;
        fd = fc;
        c = b - ratio * (b - a);
        fc = fn(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + ratio * (b - a);
        fd = fn(d);
      }
    }

    const t = (a + b) / 2;
    return { t, value: fn(t) };
  }

  function analyze(components) {
    const frequencies = components.map((component) => component.frequency);
    const periodInfo = estimateCommonPeriod(frequencies);
    const windowDuration = periodInfo.period;
    const maxFrequency = Math.max(...frequencies);
    const cyclesInWindow = maxFrequency * windowDuration;

    const sampleCount = Math.min(
      240000,
      Math.max(16000, Math.ceil(cyclesInWindow * 4096))
    );
    const dt = windowDuration / sampleCount;
    const fn = (t) => signalAt(t, components);

    let maxSample = { t: 0, value: -Infinity };
    let minSample = { t: 0, value: Infinity };
    let sumSquares = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const t = i * dt;
      const value = fn(t);
      sumSquares += value * value;

      if (value > maxSample.value) {
        maxSample = { t, value };
      }
      if (value < minSample.value) {
        minSample = { t, value };
      }
    }

    const refinedMax = goldenExtremum(
      fn,
      maxSample.t - dt,
      maxSample.t + dt,
      true
    );
    const refinedMin = goldenExtremum(
      fn,
      minSample.t - dt,
      minSample.t + dt,
      false
    );

    return {
      components,
      periodInfo,
      windowDuration,
      sampleCount,
      max: refinedMax.value,
      min: refinedMin.value,
      maxTime: refinedMax.t,
      minTime: refinedMin.t,
      vpp: refinedMax.value - refinedMin.value,
      rms: Math.sqrt(sumSquares / sampleCount)
    };
  }

  function formatNumber(value, significantDigits = 8) {
    if (!Number.isFinite(value)) {
      return "—";
    }
    if (Math.abs(value) < 1e-13) {
      return "0";
    }
    const abs = Math.abs(value);
    if (abs >= 1e7 || abs < 1e-4) {
      return value.toExponential(6);
    }
    return Number(value.toPrecision(significantDigits)).toString();
  }

  function formatTime(seconds) {
    const abs = Math.abs(seconds);
    if (abs < 1e-6) {
      return `${formatNumber(seconds * 1e9, 6)} ns`;
    }
    if (abs < 1e-3) {
      return `${formatNumber(seconds * 1e6, 6)} µs`;
    }
    if (abs < 1) {
      return `${formatNumber(seconds * 1e3, 6)} ms`;
    }
    return `${formatNumber(seconds, 6)} s`;
  }

  function phaseText(degrees) {
    const normalized = Math.abs(degrees) < 1e-12 ? 0 : degrees;
    if (normalized === 0) {
      return "";
    }
    return normalized > 0 ? ` + ${formatNumber(normalized)}°` : ` − ${formatNumber(Math.abs(normalized))}°`;
  }

  function renderFormula(components) {
    const fUnit = elements.frequencyUnit.value;
    const aUnit = elements.amplitudeUnit.value;
    const frequencyScaleText = {
      Hz: "",
      kHz: " × 10³",
      MHz: " × 10⁶"
    }[fUnit];

    const terms = components.map((component, index) => {
      const amplitude = formatNumber(component.peakAmplitude);
      const frequency = formatNumber(component.displayFrequency);
      const phase = phaseText(component.phaseDeg);
      const prefix = index === 0 ? "" : " + ";
      return `${prefix}${amplitude} sin(2π × ${frequency}${frequencyScaleText} × t${phase})`;
    });

    elements.formula.innerHTML =
      `<span>u(t) = ${terms.join("")} (${escapeHtml(aUnit)})</span>` +
      `<br><small>t 的单位为 s；幅值已按正弦项峰值表示，输入频率单位为 ${escapeHtml(fUnit)}。</small>`;
  }

  function renderSpectrum(components) {
    const fUnit = elements.frequencyUnit.value;
    const aUnit = elements.amplitudeUnit.value;
    elements.spectrumBody.innerHTML = components.map((component) => `
      <tr>
        <td>${escapeHtml(component.name)} ${escapeHtml(component.symbol)}</td>
        <td>${formatNumber(component.displayFrequency)} ${escapeHtml(fUnit)}</td>
        <td>${formatNumber(component.peakAmplitude)} ${escapeHtml(aUnit)}</td>
        <td>${formatNumber(component.phaseDeg)}°</td>
      </tr>
    `).join("");
  }

  function chooseTimeScale(duration) {
    if (duration < 1e-6) {
      return { factor: 1e9, unit: "ns" };
    }
    if (duration < 1e-3) {
      return { factor: 1e6, unit: "µs" };
    }
    if (duration < 1) {
      return { factor: 1e3, unit: "ms" };
    }
    return { factor: 1, unit: "s" };
  }

  function drawWaveform(result) {
    const canvas = elements.waveformCanvas;
    const rect = canvas.getBoundingClientRect();
    const displayDuration = result.windowDuration * displayedPeriods;
    if (rect.width < 10 || rect.height < 10) {
      return;
    }

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const width = rect.width;
    const height = rect.height;
    const margin = { top: 24, right: 24, bottom: 48, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const amplitudePadding = Math.max(result.vpp * 0.08, Math.max(Math.abs(result.max), Math.abs(result.min)) * 0.04, 1e-9);
    let yMax = result.max + amplitudePadding;
    let yMin = result.min - amplitudePadding;
    if (Math.abs(yMax - yMin) < 1e-12) {
      yMax = 1;
      yMin = -1;
    }

    const xFor = (t) => margin.left + (t / displayDuration) * plotWidth;
    const yFor = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#dce4ef";
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i += 1) {
      const value = yMax - (i / yTicks) * (yMax - yMin);
      const y = yFor(value);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      ctx.fillText(formatNumber(value, 5), margin.left - 10, y);
    }

    const timeScale = chooseTimeScale(displayDuration);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i += 1) {
      const t = (i / xTicks) * displayDuration;
      const x = xFor(t);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();
      ctx.fillText(formatNumber(t * timeScale.factor, 5), x, height - margin.bottom + 10);
    }

    if (yMin <= 0 && yMax >= 0) {
      ctx.strokeStyle = "#9aabc1";
      ctx.lineWidth = 1.2;
      const zeroY = yFor(0);
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(width - margin.right, zeroY);
      ctx.stroke();
    }

    if (displayedPeriods > 1) {
      ctx.save();
      ctx.strokeStyle = "#b8c5d8";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      for (let periodIndex = 1; periodIndex < displayedPeriods; periodIndex += 1) {
        const boundaryX = xFor(result.windowDuration * periodIndex);
        ctx.beginPath();
        ctx.moveTo(boundaryX, margin.top);
        ctx.lineTo(boundaryX, height - margin.bottom);
        ctx.stroke();
      }
      ctx.restore();
    }

    const pointCount = Math.min(
      12000,
      Math.max(1400, Math.floor(plotWidth * 3 * Math.sqrt(displayedPeriods)))
    );
    ctx.strokeStyle = "#2457d6";
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (let i = 0; i <= pointCount; i += 1) {
      const t = (i / pointCount) * displayDuration;
      const value = signalAt(t, result.components);
      const x = xFor(t);
      const y = yFor(value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    const extrema = [
      { t: modulo(result.maxTime, result.windowDuration), value: result.max, label: "max" },
      { t: modulo(result.minTime, result.windowDuration), value: result.min, label: "min" }
    ];

    ctx.fillStyle = "#173eaa";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    for (const point of extrema) {
      const x = xFor(point.t);
      const y = yFor(point.value);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`${point.label}: ${formatNumber(point.value, 6)}`, Math.min(x + 8, width - 150), y - 7);
    }

    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`时间 / ${timeScale.unit}`, margin.left + plotWidth / 2, height - 4);

    ctx.save();
    ctx.translate(15, margin.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(`电压 / ${elements.amplitudeUnit.value}`, 0, 0);
    ctx.restore();
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function renderResult(result) {
    const unit = elements.amplitudeUnit.value;
    elements.vppValue.textContent = formatNumber(result.vpp);
    elements.maxValue.textContent = formatNumber(result.max);
    elements.minValue.textContent = formatNumber(result.min);
    elements.rmsValue.textContent = formatNumber(result.rms);

    for (const unitElement of [
      elements.vppUnit,
      elements.maxUnit,
      elements.minUnit,
      elements.rmsUnit
    ]) {
      unitElement.textContent = unit;
    }

    const periodLabel = result.periodInfo.exactEnough ? "公共周期" : "基础观察窗";
    elements.windowInfo.textContent =
      `${periodLabel}：${formatTime(result.windowDuration)} · 显示 ${displayedPeriods} 个`;

    if (result.periodInfo.exactEnough) {
      elements.calculationNote.textContent =
        `当前横轴显示 ${displayedPeriods} 个公共周期。峰峰值仍在一个公共周期内使用 ${result.sampleCount.toLocaleString("zh-CN")} 个采样点搜索，并在极值附近继续数值细化。`;
    } else {
      elements.calculationNote.textContent =
        `当前横轴显示 ${displayedPeriods} 个基础观察窗。输入频率未形成较短公共周期，因此极值结果只代表基础观察窗内的数值搜索。`;
    }

    renderFormula(result.components);
    renderSpectrum(result.components);
    drawWaveform(result);
  }

  function setDisplayedPeriods(periodCount) {
    const parsed = Number(periodCount);
    if (![1, 2, 5, 10].includes(parsed)) {
      return;
    }

    displayedPeriods = parsed;
    for (const button of elements.periodButtons) {
      const isActive = Number(button.dataset.periods) === displayedPeriods;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    if (lastResult) {
      renderResult(lastResult);
    }
  }

  function calculate() {
    const components = getComponents();
    const error = validate(components);

    if (error) {
      elements.validationMessage.hidden = false;
      elements.validationMessage.textContent = error;
      return;
    }

    elements.validationMessage.hidden = true;
    const result = analyze(components);
    lastResult = result;
    renderResult(result);
    updateDisabledRows();
  }

  function updateDisabledRows() {
    const rowH1 = document.querySelector('[data-component="h1"]');
    const rowH2 = document.querySelector('[data-component="h2"]');
    rowH1.classList.toggle("is-disabled", !elements.enableH1.checked);
    rowH2.classList.toggle("is-disabled", !elements.enableH2.checked);

    for (const input of [elements.f2, elements.a2, elements.p2]) {
      input.disabled = !elements.enableH1.checked;
    }
    for (const input of [elements.f3, elements.a3, elements.p3]) {
      input.disabled = !elements.enableH2.checked;
    }
  }

  function applyValues(values) {
    elements.frequencyUnit.value = values.frequencyUnit;
    elements.amplitudeUnit.value = values.amplitudeUnit;
    elements.amplitudeMode.value = values.amplitudeMode;
    elements.enableH1.checked = values.enableH1;
    elements.enableH2.checked = values.enableH2;

    for (const key of ["f1", "a1", "p1", "f2", "a2", "p2", "f3", "a3", "p3"]) {
      elements[key].value = values[key];
    }

    updateDisabledRows();
    calculate();
  }

  function buildCopyText() {
    if (!lastResult) {
      return "";
    }

    const unit = elements.amplitudeUnit.value;
    const fUnit = elements.frequencyUnit.value;
    const lines = [
      "合成信号计算结果",
      `峰峰值 Upp = ${formatNumber(lastResult.vpp)} ${unit}`,
      `最大值 Umax = ${formatNumber(lastResult.max)} ${unit}`,
      `最小值 Umin = ${formatNumber(lastResult.min)} ${unit}`,
      `有效值 URMS = ${formatNumber(lastResult.rms)} ${unit}`,
      "",
      "频谱分量："
    ];

    for (const component of lastResult.components) {
      lines.push(
        `${component.name}：${formatNumber(component.displayFrequency)} ${fUnit}，` +
        `${formatNumber(component.peakAmplitude)} ${unit}，相位 ${formatNumber(component.phaseDeg)}°`
      );
    }

    return lines.join("\n");
  }

  async function copyResult() {
    const text = buildCopyText();
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      elements.copyResult.textContent = "已复制";
      window.setTimeout(() => {
        elements.copyResult.textContent = "复制结果";
      }, 1400);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      elements.copyResult.textContent = "已复制";
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const watchedInputs = document.querySelectorAll("input, select");
  for (const input of watchedInputs) {
    input.addEventListener("change", calculate);
  }

  elements.calculate.addEventListener("click", calculate);
  elements.reset.addEventListener("click", () => applyValues(defaults));
  elements.loadExample.addEventListener("click", () => applyValues(defaults));
  elements.copyResult.addEventListener("click", copyResult);
  for (const button of elements.periodButtons) {
    button.addEventListener("click", () => {
      setDisplayedPeriods(button.dataset.periods);
    });
  }
  elements.enableH1.addEventListener("change", updateDisabledRows);
  elements.enableH2.addEventListener("change", updateDisabledRows);

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (lastResult) {
        drawWaveform(lastResult);
      }
    }, 100);
  });

  updateDisabledRows();
  setDisplayedPeriods(1);
  calculate();
})();
