/**
 * WSN Simulation Engine
 * Implements 7 techniques: HIECF, DRL+GNN, TD3-DRL, Federated RL,
 * GNN Clustering, DL-HEED, ML+Metaheuristic
 * 
 * Uses first-order radio model and analytical behavior modeling
 * calibrated from the HIECF paper's results.
 */

// ===== CONSTANTS =====
const SIM_CONFIG = {
  AREA_WIDTH: 100,
  AREA_HEIGHT: 100,
  BS_X: 50,
  BS_Y: 150,
  NUM_NODES: 100,
  E0: 1.0,             // Initial energy (J)
  PACKET_SIZE: 4000,    // bits
  E_ELEC: 50e-9,        // nJ/bit → J/bit
  E_FS: 10e-12,         // pJ/bit/m² → J/bit/m²
  E_MP: 0.0013e-12,     // pJ/bit/m⁴ → J/bit/m⁴
  E_DA: 5e-9,           // Data aggregation energy J/bit
  D_CROSSOVER: 87,      // Crossover distance (m)
  // Heterogeneity parameters
  NORMAL_FRAC: 0.6,
  ADVANCED_FRAC: 0.2,
  SUPER_FRAC: 0.2,
  ALPHA: 1.0,           // Advanced energy multiplier
  BETA: 2.0,            // Super energy multiplier
  CH_PERCENTAGE: 0.05,  // 5% cluster heads
};

// ===== TECHNIQUE CONFIGURATIONS =====
// Each technique has parameters that model its characteristic behavior
const TECHNIQUE_PROFILES = {
  hiecf: {
    name: 'HIECF',
    color: '#a855f7',
    chEfficiency: 0.95,      // How well CHs are selected (0-1)
    routingEfficiency: 0.92, // Multi-hop routing quality
    overheadFactor: 0.35,    // Control packet overhead multiplier
    adaptability: 0.90,      // How well it adapts over time
    energyBalance: 0.93,     // How evenly energy is distributed
    convergenceSpeed: 0.85,  // How quickly it optimizes
    latencyFactor: 0.70,       // End-to-end delay multiplier (lower = better)
    reliabilityFactor: 0.98,   // Packet delivery reliability (higher = better)
    description: 'Fuzzy preselection + Q-learning + cooperative multi-hop routing'
  },
  drl_gnn: {
    name: 'DRL + GNN Hybrid',
    color: '#06b6d4',
    chEfficiency: 0.91,
    routingEfficiency: 0.89,
    overheadFactor: 0.55,
    adaptability: 0.88,
    energyBalance: 0.87,
    convergenceSpeed: 0.70,
    latencyFactor: 0.78,
    reliabilityFactor: 0.95,
    description: 'Deep RL with Graph Neural Networks for joint clustering & routing'
  },
  td3_drl: {
    name: 'TD3-based DRL',
    color: '#f59e0b',
    chEfficiency: 0.89,
    routingEfficiency: 0.86,
    overheadFactor: 0.50,
    adaptability: 0.86,
    energyBalance: 0.85,
    convergenceSpeed: 0.65,
    latencyFactor: 0.82,
    reliabilityFactor: 0.93,
    description: 'Twin Delayed DDPG for continuous-space energy optimization'
  },
  federated_rl: {
    name: 'Federated RL',
    color: '#10b981',
    chEfficiency: 0.87,
    routingEfficiency: 0.84,
    overheadFactor: 0.60,
    adaptability: 0.85,
    energyBalance: 0.86,
    convergenceSpeed: 0.72,
    latencyFactor: 0.85,
    reliabilityFactor: 0.94,
    description: 'Distributed RL with local training and global model aggregation'
  },
  gnn_cluster: {
    name: 'GNN Clustering',
    color: '#3b82f6',
    chEfficiency: 0.88,
    routingEfficiency: 0.82,
    overheadFactor: 0.48,
    adaptability: 0.83,
    energyBalance: 0.84,
    convergenceSpeed: 0.68,
    latencyFactor: 0.80,
    reliabilityFactor: 0.92,
    description: 'Graph Convolutional Network for topology-aware cluster formation'
  },
  dl_heed: {
    name: 'DL-based HEED',
    color: '#f43f5e',
    chEfficiency: 0.84,
    routingEfficiency: 0.80,
    overheadFactor: 0.42,
    adaptability: 0.78,
    energyBalance: 0.81,
    convergenceSpeed: 0.75,
    latencyFactor: 0.88,
    reliabilityFactor: 0.90,
    description: 'Deep learning enhanced HEED with neural CH selection'
  },
  ml_meta: {
    name: 'ML + Metaheuristic',
    color: '#e879f9',
    chEfficiency: 0.85,
    routingEfficiency: 0.81,
    overheadFactor: 0.45,
    adaptability: 0.80,
    energyBalance: 0.82,
    convergenceSpeed: 0.60,
    latencyFactor: 0.86,
    reliabilityFactor: 0.91,
    description: 'ML models combined with PSO/GA/ACO for CH optimization'
  }
};

// ===== SEEDED RANDOM NUMBER GENERATOR =====
class SeededRNG {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return this.seed / 2147483647;
  }
  nextRange(min, max) {
    return min + this.next() * (max - min);
  }
}

// ===== SENSOR NODE =====
class SensorNode {
  constructor(id, x, y, initialEnergy, type) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.initialEnergy = initialEnergy;
    this.energy = initialEnergy;
    this.type = type; // 'normal', 'advanced', 'super'
    this.alive = true;
    this.isClusterHead = false;
    this.clusterId = -1;
    this.deathRound = -1;
  }

  distanceTo(x, y) {
    return Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2);
  }

  distanceToBS() {
    return this.distanceTo(SIM_CONFIG.BS_X, SIM_CONFIG.BS_Y);
  }

  consumeEnergy(amount) {
    if (!this.alive) return;
    this.energy -= amount;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
    }
  }
}

// ===== NETWORK =====
class WSNNetwork {
  constructor(seed = 42) {
    this.rng = new SeededRNG(seed);
    this.nodes = [];
    this.deployNodes();
  }

  deployNodes() {
    const n = SIM_CONFIG.NUM_NODES;
    const normalCount = Math.floor(n * SIM_CONFIG.NORMAL_FRAC);
    const advancedCount = Math.floor(n * SIM_CONFIG.ADVANCED_FRAC);
    const superCount = n - normalCount - advancedCount;

    let id = 0;
    // Normal nodes
    for (let i = 0; i < normalCount; i++) {
      const x = this.rng.nextRange(0, SIM_CONFIG.AREA_WIDTH);
      const y = this.rng.nextRange(0, SIM_CONFIG.AREA_HEIGHT);
      this.nodes.push(new SensorNode(id++, x, y, SIM_CONFIG.E0, 'normal'));
    }
    // Advanced nodes
    for (let i = 0; i < advancedCount; i++) {
      const x = this.rng.nextRange(0, SIM_CONFIG.AREA_WIDTH);
      const y = this.rng.nextRange(0, SIM_CONFIG.AREA_HEIGHT);
      const energy = SIM_CONFIG.E0 * (1 + SIM_CONFIG.ALPHA);
      this.nodes.push(new SensorNode(id++, x, y, energy, 'advanced'));
    }
    // Super nodes
    for (let i = 0; i < superCount; i++) {
      const x = this.rng.nextRange(0, SIM_CONFIG.AREA_WIDTH);
      const y = this.rng.nextRange(0, SIM_CONFIG.AREA_HEIGHT);
      const energy = SIM_CONFIG.E0 * (1 + SIM_CONFIG.BETA);
      this.nodes.push(new SensorNode(id++, x, y, energy, 'super'));
    }
  }

  getAliveNodes() {
    return this.nodes.filter(n => n.alive);
  }

  getAliveCount() {
    return this.nodes.filter(n => n.alive).length;
  }

  getTotalResidualEnergy() {
    return this.nodes.reduce((sum, n) => sum + n.energy, 0);
  }

  getTotalInitialEnergy() {
    return this.nodes.reduce((sum, n) => sum + n.initialEnergy, 0);
  }

  clone() {
    const net = new WSNNetwork(1); // dummy
    net.nodes = this.nodes.map(n => {
      const clone = new SensorNode(n.id, n.x, n.y, n.initialEnergy, n.type);
      clone.energy = n.energy;
      clone.alive = n.alive;
      return clone;
    });
    return net;
  }
}

// ===== ENERGY MODEL =====
function transmitEnergy(bits, distance) {
  const d0 = SIM_CONFIG.D_CROSSOVER;
  const elec = SIM_CONFIG.E_ELEC * bits;
  if (distance <= d0) {
    return elec + SIM_CONFIG.E_FS * bits * distance * distance;
  } else {
    return elec + SIM_CONFIG.E_MP * bits * Math.pow(distance, 4);
  }
}

function receiveEnergy(bits) {
  return SIM_CONFIG.E_ELEC * bits;
}

function aggregationEnergy(bits) {
  return SIM_CONFIG.E_DA * bits;
}

// ===== SIMULATION ENGINE =====
class SimulationEngine {
  constructor(techniqueId, maxRounds, seed = 42) {
    this.techniqueId = techniqueId;
    this.profile = TECHNIQUE_PROFILES[techniqueId];
    this.maxRounds = maxRounds;
    this.network = new WSNNetwork(seed);
    this.rng = new SeededRNG(seed + techniqueId.length * 7);

    // Metrics
    this.roundData = [];
    this.fnd = -1;
    this.hnd = -1;
    this.lnd = -1;
    this.totalPacketsDelivered = 0;
    this.totalEnergyConsumed = 0;
    this.totalOverhead = 0;
    this.totalLatency = 0;
    this.roundCount = 0;
    this.totalPacketsSent = 0;
    this.totalPacketsReceived = 0;
    this.currentRound = 0;
  }

  run() {
    const totalNodes = SIM_CONFIG.NUM_NODES;
    let prevAlive = totalNodes;

    for (let r = 1; r <= this.maxRounds; r++) {
      this.currentRound = r;
      const aliveNodes = this.network.getAliveNodes();
      
      if (aliveNodes.length === 0) {
        // Record LND as previous round (the round that killed the last node)
        if (this.lnd === -1) this.lnd = r - 1;
        // Network is dead, fill remaining rounds with last values
        for (let rr = r; rr <= this.maxRounds; rr++) {
          this.roundData.push({
            round: rr,
            aliveNodes: 0,
            residualEnergy: 0,
            throughput: this.totalPacketsDelivered,
            packetsThisRound: 0,
            overhead: this.totalOverhead,
            eer: this.totalEnergyConsumed > 0 ? this.totalPacketsDelivered / this.totalEnergyConsumed : 0,
            latency: 0,
            pdr: this.totalPacketsSent > 0 ? (this.totalPacketsReceived / this.totalPacketsSent) * 100 : 0
          });
        }
        break;
      }

      // 1. Select cluster heads
      const clusterHeads = this.selectClusterHeads(aliveNodes, r);
      
      // 2. Form clusters
      this.formClusters(aliveNodes, clusterHeads);
      
      // 3. Simulate data transmission
      const { packetsDelivered, energyConsumed, controlPackets, latency, packetsSent, packetsReceived } = this.simulateTransmission(aliveNodes, clusterHeads, r);

      this.totalPacketsDelivered += packetsDelivered;
      this.totalEnergyConsumed += energyConsumed;
      this.totalOverhead += controlPackets;
      this.totalLatency += latency;
      this.roundCount++;
      this.totalPacketsSent += packetsSent;
      this.totalPacketsReceived += packetsReceived;

      // 4. Check node deaths
      const currentAlive = this.network.getAliveCount();
      
      if (this.fnd === -1 && currentAlive < totalNodes) {
        this.fnd = r;
      }
      if (this.hnd === -1 && currentAlive <= totalNodes / 2) {
        this.hnd = r;
      }
      if (this.lnd === -1 && currentAlive === 0) {
        this.lnd = r;
      }

      // Record round data
      this.roundData.push({
        round: r,
        aliveNodes: currentAlive,
        residualEnergy: this.network.getTotalResidualEnergy(),
        throughput: this.totalPacketsDelivered,
        packetsThisRound: packetsDelivered,
        overhead: this.totalOverhead,
        eer: this.totalEnergyConsumed > 0 ? this.totalPacketsDelivered / this.totalEnergyConsumed : 0,
        latency: latency,
        pdr: this.totalPacketsSent > 0 ? (this.totalPacketsReceived / this.totalPacketsSent) * 100 : 100
      });

      prevAlive = currentAlive;
    }

    // Set defaults if never reached
    if (this.fnd === -1) this.fnd = this.maxRounds;
    if (this.hnd === -1) this.hnd = this.maxRounds;
    if (this.lnd === -1) this.lnd = this.maxRounds;

    return this.getResults();
  }

  selectClusterHeads(aliveNodes, round) {
    const profile = this.profile;
    const targetCHs = Math.max(1, Math.round(aliveNodes.length * SIM_CONFIG.CH_PERCENTAGE));
    
    // Score each node for CH candidacy
    const scores = aliveNodes.map(node => {
      const energyRatio = node.energy / node.initialEnergy;
      const distToBS = node.distanceToBS();
      const maxDist = Math.sqrt(SIM_CONFIG.AREA_WIDTH ** 2 + (SIM_CONFIG.AREA_HEIGHT + 50) ** 2);
      const distScore = 1 - (distToBS / maxDist);
      
      // Density score (how many neighbors within 30m)
      const neighbors = aliveNodes.filter(n => n.id !== node.id && node.distanceTo(n.x, n.y) < 30).length;
      const densityScore = Math.min(1, neighbors / 15);

      // Combined score influenced by technique's CH efficiency
      let score = (0.4 * energyRatio + 0.3 * distScore + 0.3 * densityScore);
      
      // Add technique-specific intelligence
      score *= profile.chEfficiency;
      
      // Add some controlled randomness (less for better techniques)
      const noise = this.rng.nextRange(-0.1, 0.1) * (1 - profile.chEfficiency);
      score += noise;

      // Energy balance factor
      score *= (0.5 + 0.5 * profile.energyBalance);

      // Adaptive improvement over rounds (convergence)
      const adaptFactor = 1 + profile.adaptability * 0.1 * Math.min(1, round / 500);
      score *= adaptFactor;

      return { node, score };
    });

    // Sort by score and select top candidates
    scores.sort((a, b) => b.score - a.score);
    const selectedCHs = scores.slice(0, targetCHs).map(s => s.node);

    // Mark as cluster heads
    aliveNodes.forEach(n => n.isClusterHead = false);
    selectedCHs.forEach(n => n.isClusterHead = true);

    return selectedCHs;
  }

  formClusters(aliveNodes, clusterHeads) {
    // Assign each non-CH node to nearest CH
    aliveNodes.forEach(node => {
      if (node.isClusterHead) {
        node.clusterId = node.id;
        return;
      }
      let minDist = Infinity;
      let bestCH = null;
      clusterHeads.forEach(ch => {
        const d = node.distanceTo(ch.x, ch.y);
        if (d < minDist) {
          minDist = d;
          bestCH = ch;
        }
      });
      node.clusterId = bestCH ? bestCH.id : -1;
    });
  }

  simulateTransmission(aliveNodes, clusterHeads, round) {
    const profile = this.profile;
    const bits = SIM_CONFIG.PACKET_SIZE;
    let packetsDelivered = 0;
    let totalEnergy = 0;
    let controlPackets = 0;

    // Control overhead for cluster formation
    const baseControlPackets = clusterHeads.length * 3 + aliveNodes.length;
    controlPackets = Math.round(baseControlPackets * profile.overheadFactor);
    
    // Additional overhead for learning-based techniques
    if (['drl_gnn', 'td3_drl', 'federated_rl'].includes(this.techniqueId)) {
      controlPackets += Math.round(aliveNodes.length * 0.3 * profile.overheadFactor);
    }
    if (this.techniqueId === 'federated_rl') {
      controlPackets += Math.round(clusterHeads.length * 2); // Model aggregation
    }

    // Control packet energy
    const controlEnergy = controlPackets * SIM_CONFIG.E_ELEC * 100; // 100 bits per control packet
    totalEnergy += controlEnergy;

    // Process each cluster
    clusterHeads.forEach(ch => {
      const members = aliveNodes.filter(n => n.clusterId === ch.id && n.id !== ch.id);

      // Intra-cluster: members transmit to CH
      members.forEach(member => {
        const dist = member.distanceTo(ch.x, ch.y);
        const txEnergy = transmitEnergy(bits, dist);
        
        // Apply technique's routing efficiency
        const effectiveTxEnergy = txEnergy * (2 - profile.routingEfficiency);
        member.consumeEnergy(effectiveTxEnergy);
        totalEnergy += effectiveTxEnergy;

        // CH receives
        const rxEnergy = receiveEnergy(bits);
        ch.consumeEnergy(rxEnergy);
        totalEnergy += rxEnergy;

        if (member.alive) {
          packetsDelivered++;
        }
      });

      // CH aggregates data
      const aggEnergy = aggregationEnergy(bits) * (members.length + 1);
      ch.consumeEnergy(aggEnergy);
      totalEnergy += aggEnergy;

      // Inter-cluster: CH transmits to BS (with routing optimization)
      if (ch.alive) {
        const distToBS = ch.distanceToBS();
        
        // Multi-hop routing benefit
        let effectiveDist = distToBS;
        if (profile.routingEfficiency > 0.85) {
          // Better techniques use multi-hop more effectively
          const hopReduction = profile.routingEfficiency * 0.3;
          effectiveDist = distToBS * (1 - hopReduction);
        }

        const txEnergy = transmitEnergy(bits * (members.length + 1), effectiveDist);
        const routedEnergy = txEnergy * (2 - profile.routingEfficiency);
        ch.consumeEnergy(routedEnergy);
        totalEnergy += routedEnergy;

        if (ch.alive) {
          packetsDelivered++;
        }
      }
    });

    // Apply energy balancing effect
    // Better energy balance means less wasted energy from uneven distribution
    const balancePenalty = 1 + (1 - profile.energyBalance) * 0.05;
    aliveNodes.forEach(node => {
      if (node.alive) {
        const penalty = SIM_CONFIG.E_ELEC * bits * 0.01 * balancePenalty;
        node.consumeEnergy(penalty);
        totalEnergy += penalty;
      }
    });

    // === Latency Calculation (ms) ===
    const avgDistToBS = aliveNodes.reduce((s, n) => s + n.distanceToBS(), 0) / Math.max(1, aliveNodes.length);
    const avgHops = Math.max(1, Math.ceil(avgDistToBS / 40));
    const txDelayMs = (SIM_CONFIG.PACKET_SIZE / 250000) * 1000; // 250kbps ZigBee → 16ms per hop
    const procDelayMs = 2.0; // processing delay per hop (ms)
    const queuingDelayMs = clusterHeads.length > 0 ? (aliveNodes.length / clusterHeads.length) * 0.5 : 0;
    const baseLatency = avgHops * (txDelayMs + procDelayMs) + queuingDelayMs;
    const networkDegradation = 1 + (1 - aliveNodes.length / SIM_CONFIG.NUM_NODES) * 0.5;
    const latency = parseFloat((baseLatency * profile.latencyFactor * networkDegradation).toFixed(2));

    // === PDR Calculation ===
    const packetsSent = aliveNodes.length;
    const aliveRatio = aliveNodes.length / SIM_CONFIG.NUM_NODES;
    const avgEnergyRatio = aliveNodes.reduce((s, n) => s + n.energy / n.initialEnergy, 0) / Math.max(1, aliveNodes.length);
    const pdrProb = Math.min(1, profile.reliabilityFactor * (0.7 + 0.3 * aliveRatio) * (0.85 + 0.15 * avgEnergyRatio));
    const packetsReceived = Math.round(packetsSent * pdrProb);

    return { packetsDelivered, energyConsumed: totalEnergy, controlPackets, latency, packetsSent, packetsReceived };
  }

  getResults() {
    const avgLatency = this.roundCount > 0
      ? parseFloat((this.totalLatency / this.roundCount).toFixed(2))
      : 0;
    const avgPdr = this.totalPacketsSent > 0
      ? parseFloat(((this.totalPacketsReceived / this.totalPacketsSent) * 100).toFixed(2))
      : 0;

    return {
      technique: this.techniqueId,
      name: this.profile.name,
      color: this.profile.color,
      fnd: this.fnd,
      hnd: this.hnd,
      lnd: this.lnd,
      throughput: this.totalPacketsDelivered,
      eer: this.totalEnergyConsumed > 0
        ? (this.totalPacketsDelivered / this.totalEnergyConsumed).toFixed(2)
        : 0,
      overhead: this.totalOverhead,
      avgLatency: avgLatency,
      avgPdr: avgPdr,
      roundData: this.roundData,
      maxRounds: this.maxRounds
    };
  }
}

// ===== SIMULATION MANAGER =====
class SimulationManager {
  constructor() {
    this.results = {};
    this.isRunning = false;
    this.onProgress = null;
    this.onComplete = null;
    this.onRoundUpdate = null;
  }

  async runAll(techniques, maxRounds, seed = 42) {
    this.isRunning = true;
    this.results = {};
    const totalWork = techniques.length;
    let completed = 0;

    for (const techId of techniques) {
      if (!this.isRunning) break;

      const engine = new SimulationEngine(techId, maxRounds, seed);

      // Run simulation in chunks to allow UI updates
      const result = await this.runWithYield(engine, techId);
      this.results[techId] = result;

      completed++;
      if (this.onProgress) {
        this.onProgress(completed / totalWork, techId);
      }
    }

    this.isRunning = false;
    if (this.onComplete) {
      this.onComplete(this.results);
    }
    return this.results;
  }

  async runWithYield(engine, techId) {
    return new Promise(resolve => {
      // Use setTimeout to yield to UI thread
      setTimeout(() => {
        const result = engine.run();
        resolve(result);
      }, 10);
    });
  }

  stop() {
    this.isRunning = false;
  }

  getNetworkSnapshot(seed = 42) {
    const network = new WSNNetwork(seed);
    return network.nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      type: n.type,
      energy: n.energy
    }));
  }

  // ===== SCALABILITY ANALYSIS =====
  // Runs batch simulations varying node count or network area

  async runScalabilityAnalysis(maxRounds, onProgress) {
    this.isRunning = true;

    const nodeCounts = [50, 100, 150, 200];
    const areaSizes = [50, 100, 150];
    const techniques = Object.keys(TECHNIQUE_PROFILES);

    const totalRuns = (nodeCounts.length + areaSizes.length) * techniques.length;
    let completedRuns = 0;

    // === 1. Node Density Sweep (area fixed at 100×100) ===
    const nodeSweepResults = {};

    for (const nodeCount of nodeCounts) {
      if (!this.isRunning) break;

      const savedConfig = overrideConfig({
        NUM_NODES: nodeCount,
        AREA_WIDTH: 100,
        AREA_HEIGHT: 100,
        BS_X: 50,
        BS_Y: 150
      });

      const configResults = {};
      for (const techId of techniques) {
        if (!this.isRunning) break;
        const engine = new SimulationEngine(techId, maxRounds, 42);
        const result = await this.runWithYield(engine, techId);
        // Store only summary metrics (no roundData to save memory)
        configResults[techId] = {
          technique: result.technique,
          name: result.name,
          color: result.color,
          fnd: result.fnd,
          hnd: result.hnd,
          lnd: result.lnd,
          throughput: result.throughput,
          eer: result.eer,
          overhead: result.overhead,
          avgLatency: result.avgLatency,
          avgPdr: result.avgPdr
        };

        completedRuns++;
        if (onProgress) onProgress(completedRuns / totalRuns, `Nodes=${nodeCount}, ${TECHNIQUE_PROFILES[techId].name}`);
      }

      nodeSweepResults[nodeCount] = configResults;
      restoreConfig(savedConfig);
    }

    // === 2. Area Sweep (nodes fixed at 100) ===
    const areaSweepResults = {};

    for (const areaSize of areaSizes) {
      if (!this.isRunning) break;

      const savedConfig = overrideConfig({
        NUM_NODES: 100,
        AREA_WIDTH: areaSize,
        AREA_HEIGHT: areaSize,
        BS_X: areaSize / 2,
        BS_Y: areaSize * 1.5
      });

      const configResults = {};
      for (const techId of techniques) {
        if (!this.isRunning) break;
        const engine = new SimulationEngine(techId, maxRounds, 42);
        const result = await this.runWithYield(engine, techId);
        configResults[techId] = {
          technique: result.technique,
          name: result.name,
          color: result.color,
          fnd: result.fnd,
          hnd: result.hnd,
          lnd: result.lnd,
          throughput: result.throughput,
          eer: result.eer,
          overhead: result.overhead,
          avgLatency: result.avgLatency,
          avgPdr: result.avgPdr
        };

        completedRuns++;
        if (onProgress) onProgress(completedRuns / totalRuns, `Area=${areaSize}×${areaSize}, ${TECHNIQUE_PROFILES[techId].name}`);
      }

      areaSweepResults[areaSize] = configResults;
      restoreConfig(savedConfig);
    }

    this.isRunning = false;
    return { nodeSweep: nodeSweepResults, areaSweep: areaSweepResults };
  }
}

// ===== CONFIG OVERRIDE UTILITIES =====
function overrideConfig(overrides) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = SIM_CONFIG[key];
    SIM_CONFIG[key] = overrides[key];
  }
  return saved;
}

function restoreConfig(saved) {
  for (const key of Object.keys(saved)) {
    SIM_CONFIG[key] = saved[key];
  }
}

// ===== EXPORT =====
window.SimulationManager = SimulationManager;
window.TECHNIQUE_PROFILES = TECHNIQUE_PROFILES;
window.SIM_CONFIG = SIM_CONFIG;
