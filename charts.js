/**
 * Charts & Visualization Layer
 * Uses Chart.js for metrics charts and Canvas API for network topology
 */

// ===== CHART THEME =====
const CHART_THEME = {
  fontFamily: "'Inter', sans-serif",
  fontColor: '#94a3b8',
  gridColor: 'rgba(255, 255, 255, 0.04)',
  hoverBorderColor: 'rgba(255, 255, 255, 0.3)',
  tooltipBg: 'rgba(17, 24, 39, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.1)',
};

// Global Chart.js defaults
Chart.defaults.color = CHART_THEME.fontColor;
Chart.defaults.font.family = CHART_THEME.fontFamily;
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = CHART_THEME.tooltipBg;
Chart.defaults.plugins.tooltip.borderColor = CHART_THEME.tooltipBorder;
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 5;
Chart.defaults.elements.line.tension = 0.3;
Chart.defaults.elements.line.borderWidth = 2;

// ===== CHART MANAGER =====
class ChartManager {
  constructor() {
    this.charts = {};
    this.networkCanvas = null;
    this.networkCtx = null;
    this.animationFrame = null;
    this.nodePositions = [];
  }

  // ===== NETWORK VISUALIZATION =====
  initNetworkCanvas(canvasId) {
    this.networkCanvas = document.getElementById(canvasId);
    if (!this.networkCanvas) return;
    this.networkCtx = this.networkCanvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.networkCanvas) return;
    const wrapper = this.networkCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.networkCanvas.width = wrapper.clientWidth * dpr;
    this.networkCanvas.height = wrapper.clientHeight * dpr;
    this.networkCtx.scale(dpr, dpr);
    this.networkCanvas.style.width = wrapper.clientWidth + 'px';
    this.networkCanvas.style.height = wrapper.clientHeight + 'px';
    if (this.nodePositions.length > 0) {
      this.drawNetwork(this.nodePositions);
    }
  }

  drawNetwork(nodes, highlightTechnique = null, roundData = null) {
    const ctx = this.networkCtx;
    const canvas = this.networkCanvas;
    if (!ctx || !canvas) return;

    this.nodePositions = nodes;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background grid
    this.drawGrid(ctx, w, h);

    // Scale factors
    const padding = 40;
    const scaleX = (w - padding * 2) / SIM_CONFIG.AREA_WIDTH;
    const scaleY = (h - padding * 2) / (SIM_CONFIG.BS_Y + 10);

    // Draw sensing area boundary
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      padding,
      padding + (SIM_CONFIG.BS_Y - SIM_CONFIG.AREA_HEIGHT) * scaleY,
      SIM_CONFIG.AREA_WIDTH * scaleX,
      SIM_CONFIG.AREA_HEIGHT * scaleY
    );
    ctx.setLineDash([]);

    // Label for sensing area
    ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.font = '10px Inter';
    ctx.fillText('100×100m² Sensing Region', padding + 4,
      padding + (SIM_CONFIG.BS_Y - SIM_CONFIG.AREA_HEIGHT) * scaleY + 14);

    // Draw base station
    const bsX = padding + SIM_CONFIG.BS_X * scaleX;
    const bsY = padding + (SIM_CONFIG.BS_Y - SIM_CONFIG.BS_Y) * scaleY;

    // BS glow
    const bsGlow = ctx.createRadialGradient(bsX, bsY, 0, bsX, bsY, 20);
    bsGlow.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
    bsGlow.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = bsGlow;
    ctx.beginPath();
    ctx.arc(bsX, bsY, 20, 0, Math.PI * 2);
    ctx.fill();

    // BS icon (triangle)
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(bsX, bsY - 10);
    ctx.lineTo(bsX - 8, bsY + 6);
    ctx.lineTo(bsX + 8, bsY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('BS (50,150)', bsX, bsY + 20);

    // Draw nodes
    nodes.forEach((node, i) => {
      const nx = padding + node.x * scaleX;
      const ny = padding + (SIM_CONFIG.BS_Y - node.y) * scaleY;

      const isAlive = node.energy > 0;
      let color, size;

      if (!isAlive) {
        color = 'rgba(100, 116, 139, 0.3)';
        size = 3;
      } else {
        const energyRatio = node.energy / (node.type === 'super' ? SIM_CONFIG.E0 * 3 :
          node.type === 'advanced' ? SIM_CONFIG.E0 * 2 : SIM_CONFIG.E0);
        
        if (node.type === 'super') {
          color = `rgba(168, 85, 247, ${0.4 + energyRatio * 0.6})`;
          size = 5;
        } else if (node.type === 'advanced') {
          color = `rgba(6, 182, 212, ${0.4 + energyRatio * 0.6})`;
          size = 4;
        } else {
          color = `rgba(56, 189, 248, ${0.3 + energyRatio * 0.7})`;
          size = 3.5;
        }
      }

      // Node glow
      if (isAlive) {
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, size * 3);
        glow.addColorStop(0, color.replace(/[\d.]+\)$/, '0.15)'));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nx, ny, size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Legend
    this.drawNetworkLegend(ctx, w, h);
    ctx.textAlign = 'start';
  }

  drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const step = 30;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  drawNetworkLegend(ctx, w, h) {
    const legends = [
      { label: 'Normal Node', color: 'rgba(56, 189, 248, 0.8)', size: 3.5 },
      { label: 'Advanced Node', color: 'rgba(6, 182, 212, 0.8)', size: 4 },
      { label: 'Super Node', color: 'rgba(168, 85, 247, 0.8)', size: 5 },
      { label: 'Dead Node', color: 'rgba(100, 116, 139, 0.3)', size: 3 },
    ];

    const x = w - 140;
    let y = h - 80;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, x - 10, y - 12, 145, legends.length * 20 + 10, 6);
    ctx.fill();

    legends.forEach(leg => {
      ctx.fillStyle = leg.color;
      ctx.beginPath();
      ctx.arc(x + 4, y + 2, leg.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(leg.label, x + 16, y + 5);
      y += 18;
    });
  }

  // ===== METRIC CHARTS =====
  createAliveNodesChart(canvasId, results) {
    this.destroyChart('aliveNodes');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = Object.values(results).map(r => ({
      label: r.name,
      data: r.roundData.map(d => ({ x: d.round, y: d.aliveNodes })),
      borderColor: r.color,
      backgroundColor: r.color + '15',
      fill: false,
      borderWidth: 2,
    }));

    this.charts.aliveNodes = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Communication Rounds', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
          },
          y: {
            title: { display: true, text: 'Alive Nodes', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
            min: 0,
            max: SIM_CONFIG.NUM_NODES + 5,
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createResidualEnergyChart(canvasId, results) {
    this.destroyChart('residualEnergy');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = Object.values(results).map(r => ({
      label: r.name,
      data: r.roundData.map(d => ({ x: d.round, y: d.residualEnergy })),
      borderColor: r.color,
      backgroundColor: r.color + '15',
      fill: false,
      borderWidth: 2,
    }));

    this.charts.residualEnergy = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Communication Rounds', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
          },
          y: {
            title: { display: true, text: 'Residual Energy (J)', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
            min: 0,
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createThroughputChart(canvasId, results) {
    this.destroyChart('throughput');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = Object.values(results).map(r => ({
      label: r.name,
      data: r.roundData.map(d => ({ x: d.round, y: d.throughput })),
      borderColor: r.color,
      backgroundColor: r.color + '15',
      fill: false,
      borderWidth: 2,
    }));

    this.charts.throughput = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Communication Rounds', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
          },
          y: {
            title: { display: true, text: 'Cumulative Throughput (packets)', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
            min: 0,
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createBarComparisonChart(canvasId, results, metric, label) {
    const chartKey = metric + 'Bar';
    this.destroyChart(chartKey);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);
    const isOverhead = metric === 'overhead';

    this.charts[chartKey] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [{
          label: label,
          data: data.map(r => parseFloat(r[metric])),
          backgroundColor: data.map(r => r.color + '80'),
          borderColor: data.map(r => r.color),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 50,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: label, color: '#64748b' },
          },
          y: {
            grid: { display: false },
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  createFNDHNDChart(canvasId, results) {
    this.destroyChart('fndHnd');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);

    this.charts.fndHnd = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [
          {
            label: 'FND (rounds)',
            data: data.map(r => r.fnd),
            backgroundColor: data.map(r => r.color + '50'),
            borderColor: data.map(r => r.color),
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'HND (rounds)',
            data: data.map(r => r.hnd),
            backgroundColor: data.map(r => r.color + '90'),
            borderColor: data.map(r => r.color),
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'LND (rounds)',
            data: data.map(r => r.lnd),
            backgroundColor: data.map(r => r.color + 'D0'),
            borderColor: data.map(r => r.color),
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: 'Rounds', color: '#64748b' },
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createEERChart(canvasId, results) {
    this.destroyChart('eerBar');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);

    this.charts.eerBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [{
          label: 'Energy Efficiency Ratio',
          data: data.map(r => parseFloat(r.eer)),
          backgroundColor: data.map(r => r.color + '70'),
          borderColor: data.map(r => r.color),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 50,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: 'EER (packets/J)', color: '#64748b' },
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  createOverheadChart(canvasId, results) {
    this.destroyChart('overheadBar');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);

    this.charts.overheadBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [{
          label: 'Communication Overhead',
          data: data.map(r => r.overhead),
          backgroundColor: data.map(r => r.color + '70'),
          borderColor: data.map(r => r.color),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 50,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: 'Control Packets', color: '#64748b' },
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  createLatencyChart(canvasId, results) {
    this.destroyChart('latency');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = Object.values(results).map(r => ({
      label: r.name,
      data: r.roundData.map(d => ({ x: d.round, y: d.latency })),
      borderColor: r.color,
      backgroundColor: r.color + '15',
      fill: false,
      borderWidth: 2,
    }));

    this.charts.latency = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Communication Rounds', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
          },
          y: {
            title: { display: true, text: 'Average Latency (ms)', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
            min: 0,
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createPDRChart(canvasId, results) {
    this.destroyChart('pdr');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = Object.values(results).map(r => ({
      label: r.name,
      data: r.roundData.map(d => ({ x: d.round, y: d.pdr })),
      borderColor: r.color,
      backgroundColor: r.color + '15',
      fill: false,
      borderWidth: 2,
    }));

    this.charts.pdr = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Communication Rounds', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
          },
          y: {
            title: { display: true, text: 'Packet Delivery Ratio (%)', color: '#64748b' },
            grid: { color: CHART_THEME.gridColor },
            min: 0,
            max: 105,
          }
        },
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  createLatencyBarChart(canvasId, results) {
    this.destroyChart('latencyBar');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);

    this.charts.latencyBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [{
          label: 'Avg Latency (ms)',
          data: data.map(r => r.avgLatency),
          backgroundColor: data.map(r => r.color + '70'),
          borderColor: data.map(r => r.color),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 50,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: 'Average Latency (ms)', color: '#64748b' },
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  createPDRBarChart(canvasId, results) {
    this.destroyChart('pdrBar');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = Object.values(results);

    this.charts.pdrBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.name),
        datasets: [{
          label: 'Avg PDR (%)',
          data: data.map(r => r.avgPdr),
          backgroundColor: data.map(r => r.color + '70'),
          borderColor: data.map(r => r.color),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 50,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: 'Packet Delivery Ratio (%)', color: '#64748b' },
            min: 0,
            max: 105,
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // ===== UPDATE ALL CHARTS =====
  updateAllCharts(results) {
    this.createAliveNodesChart('aliveNodesChart', results);
    this.createResidualEnergyChart('residualEnergyChart', results);
    this.createThroughputChart('throughputChart', results);
    this.createFNDHNDChart('fndHndChart', results);
    this.createEERChart('eerChart', results);
    this.createOverheadChart('overheadChart', results);
    this.createLatencyChart('latencyChart', results);
    this.createPDRChart('pdrChart', results);
    this.createLatencyBarChart('latencyBarChart', results);
    this.createPDRBarChart('pdrBarChart', results);
  }

  // ===== COMPARISON TABLE =====
  updateComparisonTable(results) {
    const tbody = document.getElementById('comparisonTableBody');
    if (!tbody) return;

    const data = Object.values(results);
    
    // Find best values
    const bestFND = Math.max(...data.map(r => r.fnd));
    const bestHND = Math.max(...data.map(r => r.hnd));
    const bestLND = Math.max(...data.map(r => r.lnd));
    const bestThroughput = Math.max(...data.map(r => r.throughput));
    const bestEER = Math.max(...data.map(r => parseFloat(r.eer)));
    const bestOverhead = Math.min(...data.map(r => r.overhead));
    const bestLatency = Math.min(...data.map(r => r.avgLatency));
    const bestPDR = Math.max(...data.map(r => r.avgPdr));

    tbody.innerHTML = data.map(r => {
      const isHIECF = r.technique === 'hiecf';
      const rowClass = isHIECF ? 'hiecf-row' : '';

      return `
        <tr class="${rowClass}">
          <td>
            <span class="technique-name">
              <span class="technique-dot" style="background: ${r.color}"></span>
              ${r.name}
            </span>
          </td>
          <td class="${r.fnd === bestFND ? 'best-value' : ''}">${r.fnd.toLocaleString()}</td>
          <td class="${r.hnd === bestHND ? 'best-value' : ''}">${r.hnd.toLocaleString()}</td>
          <td class="${r.lnd === bestLND ? 'best-value' : ''}">${r.lnd.toLocaleString()}</td>
          <td class="${r.throughput === bestThroughput ? 'best-value' : ''}">${r.throughput.toLocaleString()}</td>
          <td class="${parseFloat(r.eer) === bestEER ? 'best-value' : ''}">${r.eer}</td>
          <td class="${r.overhead === bestOverhead ? 'best-value' : ''}">${r.overhead.toLocaleString()}</td>
          <td class="${r.avgLatency === bestLatency ? 'best-value' : ''}">${r.avgLatency} ms</td>
          <td class="${r.avgPdr === bestPDR ? 'best-value' : ''}">${r.avgPdr}%</td>
        </tr>
      `;
    }).join('');
  }

  // ===== METRIC SUMMARY CARDS =====
  updateMetricCards(results) {
    const hiecf = results.hiecf;
    if (!hiecf) return;

    const updateCard = (id, value, sub) => {
      const el = document.getElementById(id);
      if (el) {
        el.querySelector('.metric-value').textContent = value;
        if (sub) el.querySelector('.metric-sub').textContent = sub;
      }
    };

    updateCard('fndCard', hiecf.fnd.toLocaleString(), 'HIECF Best FND');
    updateCard('hndCard', hiecf.hnd.toLocaleString(), 'HIECF Best HND');
    updateCard('lndCard', hiecf.lnd.toLocaleString(), 'HIECF Best LND');
    updateCard('throughputCard', hiecf.throughput.toLocaleString(), 'HIECF Packets');
    updateCard('eerCard', hiecf.eer, 'HIECF packets/J');
    updateCard('overheadCard', hiecf.overhead.toLocaleString(), 'HIECF Control Pkts');
    updateCard('latencyCard', hiecf.avgLatency + ' ms', 'HIECF Avg Latency');
    updateCard('pdrCard', hiecf.avgPdr + '%', 'HIECF Packet Delivery');
  }

  // ===== CLEANUP =====
  destroyChart(key) {
    if (this.charts[key]) {
      this.charts[key].destroy();
      delete this.charts[key];
    }
  }

  destroyAll() {
    Object.keys(this.charts).forEach(key => this.destroyChart(key));
  }

  // =======================================
  // ===== SCALABILITY ANALYSIS CHARTS =====
  // =======================================

  /**
   * Generic grouped bar chart for scalability sweep
   * @param {string} chartKey - unique key for this.charts
   * @param {string} canvasId - canvas element ID
   * @param {Object} sweepResults - { sweepValue: { techId: { ...metrics } } }
   * @param {string} metricKey - which metric to plot (fnd, hnd, lnd, throughput, eer, overhead, avgLatency, avgPdr)
   * @param {string} yLabel - Y axis label
   * @param {Array} sweepLabels - X axis labels
   */
  createScalabilityBarChart(chartKey, canvasId, sweepResults, metricKey, yLabel, sweepLabels) {
    this.destroyChart(chartKey);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const sweepKeys = Object.keys(sweepResults);
    const techniques = Object.keys(TECHNIQUE_PROFILES);

    // One dataset per technique
    const datasets = techniques.map(techId => {
      const profile = TECHNIQUE_PROFILES[techId];
      return {
        label: profile.name,
        data: sweepKeys.map(sv => {
          const techData = sweepResults[sv][techId];
          if (!techData) return 0;
          const val = techData[metricKey];
          return typeof val === 'string' ? parseFloat(val) : val;
        }),
        backgroundColor: profile.color + '90',
        borderColor: profile.color,
        borderWidth: 1,
        borderRadius: 3,
      };
    });

    this.charts[chartKey] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sweepLabels || sweepKeys,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            grid: { color: CHART_THEME.gridColor },
            title: { display: true, text: yLabel, color: '#64748b' },
          }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 10 } } }
        }
      }
    });
  }

  /**
   * Generate all scalability charts for a given sweep
   * @param {string} prefix - 'node' or 'area'
   * @param {Object} sweepResults
   * @param {Array} sweepLabels
   */
  createAllScalabilityCharts(prefix, sweepResults, sweepLabels) {
    const metrics = [
      { key: 'fnd', label: 'FND (rounds)', canvasId: `${prefix}FndChart` },
      { key: 'hnd', label: 'HND (rounds)', canvasId: `${prefix}HndChart` },
      { key: 'lnd', label: 'LND (rounds)', canvasId: `${prefix}LndChart` },
      { key: 'throughput', label: 'Throughput (packets)', canvasId: `${prefix}ThroughputChart` },
      { key: 'eer', label: 'EER (packets/J)', canvasId: `${prefix}EerChart` },
      { key: 'overhead', label: 'Overhead (ctrl pkts)', canvasId: `${prefix}OverheadChart` },
      { key: 'avgLatency', label: 'Latency (ms)', canvasId: `${prefix}LatencyChart` },
      { key: 'avgPdr', label: 'PDR (%)', canvasId: `${prefix}PdrChart` },
    ];

    metrics.forEach(m => {
      this.createScalabilityBarChart(
        `${prefix}_${m.key}`,
        m.canvasId,
        sweepResults,
        m.key,
        m.label,
        sweepLabels
      );
    });
  }

  /**
   * Generate comparison table for a sweep
   * @param {string} tbodyId - table body element ID
   * @param {Object} sweepResults
   * @param {Array} sweepKeys - the sweep values (e.g. [50, 100, 150, 200])
   * @param {string} sweepLabel - label for sweep values (e.g. 'Nodes' or 'Area')
   */
  createScalabilityTable(tbodyId, sweepResults, sweepKeys, sweepLabel) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const techniques = Object.keys(TECHNIQUE_PROFILES);
    const metricDefs = [
      { key: 'fnd', label: 'FND', higher: true },
      { key: 'hnd', label: 'HND', higher: true },
      { key: 'lnd', label: 'LND', higher: true },
      { key: 'throughput', label: 'Throughput', higher: true },
      { key: 'eer', label: 'EER', higher: true },
      { key: 'overhead', label: 'Overhead', higher: false },
      { key: 'avgLatency', label: 'Latency', higher: false },
      { key: 'avgPdr', label: 'PDR', higher: true },
    ];

    let html = '';

    for (const sv of sweepKeys) {
      const configData = sweepResults[sv];
      if (!configData) continue;

      const techIds = Object.keys(configData);

      // Find bests for this configuration
      const bests = {};
      metricDefs.forEach(m => {
        const vals = techIds.map(t => {
          const v = configData[t][m.key];
          return typeof v === 'string' ? parseFloat(v) : v;
        });
        bests[m.key] = m.higher ? Math.max(...vals) : Math.min(...vals);
      });

      // Separator row
      html += `<tr class="sweep-separator"><td colspan="9" class="sweep-label">${sweepLabel} = ${sv}</td></tr>`;

      techIds.forEach(techId => {
        const r = configData[techId];
        const isHIECF = techId === 'hiecf';
        const rowClass = isHIECF ? 'hiecf-row' : '';

        const fndVal = r.fnd;
        const hndVal = r.hnd;
        const lndVal = r.lnd;
        const tpVal = r.throughput;
        const eerVal = typeof r.eer === 'string' ? parseFloat(r.eer) : r.eer;
        const ohVal = r.overhead;
        const latVal = r.avgLatency;
        const pdrVal = r.avgPdr;

        html += `
          <tr class="${rowClass}">
            <td>
              <span class="technique-name">
                <span class="technique-dot" style="background: ${r.color}"></span>
                ${r.name}
              </span>
            </td>
            <td class="${fndVal === bests.fnd ? 'best-value' : ''}">${fndVal.toLocaleString()}</td>
            <td class="${hndVal === bests.hnd ? 'best-value' : ''}">${hndVal.toLocaleString()}</td>
            <td class="${lndVal === bests.lnd ? 'best-value' : ''}">${lndVal.toLocaleString()}</td>
            <td class="${tpVal === bests.throughput ? 'best-value' : ''}">${tpVal.toLocaleString()}</td>
            <td class="${eerVal === bests.eer ? 'best-value' : ''}">${r.eer}</td>
            <td class="${ohVal === bests.overhead ? 'best-value' : ''}">${ohVal.toLocaleString()}</td>
            <td class="${latVal === bests.avgLatency ? 'best-value' : ''}">${latVal} ms</td>
            <td class="${pdrVal === bests.avgPdr ? 'best-value' : ''}">${pdrVal}%</td>
          </tr>
        `;
      });
    }

    tbody.innerHTML = html;
  }
}

// Helper: rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ===== EXPORT =====
window.ChartManager = ChartManager;
