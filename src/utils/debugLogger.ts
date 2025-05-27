import debug from 'debug';

// Create namespaced debuggers
const createDebugger = (namespace: string) => {
  if (typeof window === 'undefined') {
    return (...args: any[]) => {}; // No-op function for server-side
  }
  return debug(`audio-companion:${namespace}`);
};

export const debugLog = {
  audio: createDebugger('audio'),
  worker: createDebugger('worker'),
  tensor: createDebugger('tensor'),
  performance: createDebugger('performance'),
  memory: createDebugger('memory')
};

// Performance monitoring
interface PerformanceMetric {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: number;
  memoryAfter?: number;
  memoryDiff?: number;
}

const metrics = new Map<string, PerformanceMetric>();

export const performanceMonitor = {
  start: (id: string) => {
    if (typeof window === 'undefined') return;
    const memoryInfo = (window.performance as any).memory;
    metrics.set(id, {
      startTime: window.performance.now(),
      memoryBefore: memoryInfo?.usedJSHeapSize
    });
    debugLog.performance(`Started ${id}`);
  },

  end: (id: string) => {
    if (typeof window === 'undefined') return;
    const metric = metrics.get(id);
    if (!metric) {
      debugLog.performance(`No start metric found for ${id}`);
      return;
    }

    const memoryInfo = (window.performance as any).memory;
    const endTime = window.performance.now();
    metric.endTime = endTime;
    metric.duration = endTime - metric.startTime;
    metric.memoryAfter = memoryInfo?.usedJSHeapSize;
    metric.memoryDiff = metric.memoryAfter && metric.memoryBefore ? 
      metric.memoryAfter - metric.memoryBefore : undefined;

    debugLog.performance(`Ended ${id}:`, {
      duration: `${metric.duration.toFixed(2)}ms`,
      memoryDiff: metric.memoryDiff ? `${(metric.memoryDiff / 1024 / 1024).toFixed(2)}MB` : 'N/A'
    });
  }
};

// Memory monitoring
export const memoryMonitor = {
  snapshot: () => {
    if (typeof window === 'undefined') return null;
    const memoryInfo = (window.performance as any).memory;
    if (!memoryInfo) return null;

    return {
      total: memoryInfo.totalJSHeapSize,
      used: memoryInfo.usedJSHeapSize,
      limit: memoryInfo.jsHeapSizeLimit
    };
  },

  log: () => {
    const snapshot = memoryMonitor.snapshot();
    if (!snapshot) {
      debugLog.memory('Memory info not available');
      return;
    }

    debugLog.memory('Memory snapshot:', {
      total: `${(snapshot.total / 1024 / 1024).toFixed(2)}MB`,
      used: `${(snapshot.used / 1024 / 1024).toFixed(2)}MB`,
      limit: `${(snapshot.limit / 1024 / 1024).toFixed(2)}MB`
    });
  }
};

// Test coverage tracking
interface CoverageData {
  functionsCalled: Set<string>;
  branchesTaken: Set<string>;
  errorsCaught: Map<string, number>;
}

class CoverageTracker {
  private static instance: CoverageTracker;
  private coverage: CoverageData = {
    functionsCalled: new Set(),
    branchesTaken: new Set(),
    errorsCaught: new Map()
  };

  private constructor() {}

  static getInstance(): CoverageTracker {
    if (!CoverageTracker.instance) {
      CoverageTracker.instance = new CoverageTracker();
    }
    return CoverageTracker.instance;
  }

  trackFunction(name: string) {
    this.coverage.functionsCalled.add(name);
    debugLog.performance(`Function called: ${name}`);
  }

  trackBranch(id: string) {
    this.coverage.branchesTaken.add(id);
    debugLog.performance(`Branch taken: ${id}`);
  }

  trackError(type: string) {
    const count = this.coverage.errorsCaught.get(type) || 0;
    this.coverage.errorsCaught.set(type, count + 1);
    debugLog.performance(`Error caught: ${type}`);
  }

  getCoverageReport(): string {
    return JSON.stringify({
      functionsCoverage: Array.from(this.coverage.functionsCalled),
      branchCoverage: Array.from(this.coverage.branchesTaken),
      errorCoverage: Object.fromEntries(this.coverage.errorsCaught)
    }, null, 2);
  }

  reset() {
    this.coverage = {
      functionsCalled: new Set(),
      branchesTaken: new Set(),
      errorsCaught: new Map()
    };
  }
}

export const coverage = CoverageTracker.getInstance(); 