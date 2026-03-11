import { useState, useEffect, useCallback } from 'react';
import { Dialog, Checkbox, Button, Input } from '@cloudflare/kumo';
import { 
  GearSixIcon, 
  XIcon, 
  PlusIcon, 
  TrashIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ShieldCheckIcon, 
  ColumnsIcon,
  FunnelIcon, 
  GearIcon
} from '@phosphor-icons/react';
import type { ColumnConfig } from '../types';

// Config from the backend
interface BackendConfig {
  server: {
    port: number;
  };
  ingest: {
    hasAuthToken: boolean;
    exclusionPatterns: string[];
  };
  buffer: {
    sizeMB: number;
    retentionDays: number;
    persistPath: string;
    autoSaveMinutes: number;
  };
  configFile: string;
}

interface SettingsProps {
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onResetColumns?: () => void;
}

type TabId = 'columns' | 'server' | 'auth' | 'exclusions';

export function Settings({
  columns,
  onColumnsChange,
  onResetColumns,
}: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('columns');
  
  // Backend config state
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Server settings state
  const [serverPort, setServerPort] = useState(8080);
  const [bufferSizeMB, setBufferSizeMB] = useState(100);
  const [retentionDays, setRetentionDays] = useState(30);
  const [persistPath, setPersistPath] = useState('');
  const [autoSaveMinutes, setAutoSaveMinutes] = useState(0);
  const [serverDirty, setServerDirty] = useState(false);
  
  // Auth token state
  const [authToken, setAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenDirty, setTokenDirty] = useState(false);
  
  // Exclusion patterns state
  const [exclusionPatterns, setExclusionPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [exclusionsDirty, setExclusionsDirty] = useState(false);

  // Fetch backend config when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data: BackendConfig = await response.json();
        setBackendConfig(data);
        setServerPort(data.server.port);
        setBufferSizeMB(data.buffer.sizeMB);
        setRetentionDays(data.buffer.retentionDays);
        setPersistPath(data.buffer.persistPath || '');
        setAutoSaveMinutes(data.buffer.autoSaveMinutes || 0);
        setServerDirty(false);
        setExclusionPatterns(data.ingest.exclusionPatterns || []);
        setExclusionsDirty(false);
        // Don't set authToken - we never receive the actual token from backend
        setAuthToken('');
        setTokenDirty(false);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (updates: {
    server?: { port?: number };
    ingest?: { authToken?: string; exclusionPatterns?: string[] };
    buffer?: { sizeMB?: number; retentionDays?: number; persistPath?: string; autoSaveMinutes?: number };
  }) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const data: BackendConfig = await response.json();
        setBackendConfig(data);
        setServerPort(data.server.port);
        setBufferSizeMB(data.buffer.sizeMB);
        setRetentionDays(data.buffer.retentionDays);
        setPersistPath(data.buffer.persistPath || '');
        setAutoSaveMinutes(data.buffer.autoSaveMinutes || 0);
        setServerDirty(false);
        setExclusionPatterns(data.ingest.exclusionPatterns || []);
        setExclusionsDirty(false);
        if (updates.ingest?.authToken !== undefined) {
          setAuthToken('');
          setTokenDirty(false);
        }
      } else {
        const text = await response.text();
        setError(text || 'Failed to save configuration');
      }
    } catch (err) {
      console.error('Failed to save config:', err);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Column handlers
  const handleToggleColumn = (key: string) => {
    const newColumns = columns.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    );
    onColumnsChange(newColumns);
  };

  const handleSelectAllColumns = () => {
    const newColumns = columns.map(col => ({ ...col, visible: true }));
    onColumnsChange(newColumns);
  };

  const handleSelectMinimumColumns = () => {
    const newColumns = columns.map(col => ({
      ...col,
      visible: col.key === 'timestamp' || col.key === 'content',
    }));
    onColumnsChange(newColumns);
  };

  // Auth token handlers

  const handleClearToken = () => {
    saveConfig({ ingest: { authToken: '' } });
    setAuthToken('');
    setTokenDirty(false);
  };

  // Exclusion pattern handlers
  const handleAddPattern = useCallback(() => {
    const trimmed = newPattern.trim();
    if (trimmed && !exclusionPatterns.includes(trimmed)) {
      setExclusionPatterns(prev => [...prev, trimmed]);
      setNewPattern('');
      setExclusionsDirty(true);
    }
  }, [newPattern, exclusionPatterns]);

  const handleRemovePattern = (index: number) => {
    setExclusionPatterns(prev => prev.filter((_, i) => i !== index));
    setExclusionsDirty(true);
  };

  // Check if any settings have been modified
  const hasUnsavedChanges = serverDirty || tokenDirty || exclusionsDirty;

  // Save all pending changes
  const handleSaveAll = async () => {
    if (!hasUnsavedChanges) return;
    
    const updates: {
      server?: { port?: number };
      ingest?: { authToken?: string; exclusionPatterns?: string[] };
      buffer?: { sizeMB?: number; retentionDays?: number; persistPath?: string; autoSaveMinutes?: number };
    } = {};

    if (serverDirty) {
      updates.server = { port: serverPort };
      updates.buffer = {
        sizeMB: bufferSizeMB,
        retentionDays: retentionDays,
        persistPath: persistPath,
        autoSaveMinutes: autoSaveMinutes,
      };
    }

    if (tokenDirty) {
      updates.ingest = { ...updates.ingest, authToken };
    }

    if (exclusionsDirty) {
      updates.ingest = { ...updates.ingest, exclusionPatterns };
    }

    await saveConfig(updates);
  };

  const visibleCount = columns.filter(c => c.visible).length;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'columns', label: 'Columns', icon: <ColumnsIcon size={16} /> },
    { id: 'server', label: 'Server', icon: <GearIcon size={16} /> },
    { id: 'auth', label: 'Auth', icon: <ShieldCheckIcon size={16} /> },
    { id: 'exclusions', label: 'Exclusions', icon: <FunnelIcon size={16} /> },
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger
        render={(props) => (
          <Button {...props} variant="outline" className="flex items-center gap-2">
            <GearSixIcon size={16} />
            Settings
          </Button>
        )}
      />
      <Dialog className="p-0 overflow-hidden !w-[calc(100vw-8rem)] !max-w-5xl h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            <Dialog.Title className="text-xl font-semibold text-kumo-default">
              Settings
            </Dialog.Title>
            {backendConfig?.configFile && (
              <p className="text-xs text-kumo-inactive mt-1 font-mono">
                {backendConfig.configFile}
              </p>
            )}
          </div>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                aria-label="Close"
                variant="secondary"
                shape="square"
                icon={<XIcon size={16} />}
              />
            )}
          />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-kumo-danger-tint border border-kumo-danger rounded text-sm text-kumo-danger">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-kumo-line px-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium
                border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-kumo-brand text-kumo-default'
                  : 'border-transparent text-kumo-subtle hover:text-kumo-default hover:border-kumo-line'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-kumo-subtle">
              Loading...
            </div>
          ) : (
            <>
              {/* Columns Tab */}
              {activeTab === 'columns' && (
                <div>
                  <p className="text-sm text-kumo-subtle mb-4">
                    Choose which columns to display in the log table.
                  </p>
                  
                  <div className="flex gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={handleSelectAllColumns}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSelectMinimumColumns}>
                      Select Minimum
                    </Button>
                    {onResetColumns && (
                      <Button variant="outline" size="sm" onClick={onResetColumns}>
                        Reset to Defaults
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    {columns.map(column => (
                      <label
                        key={column.key}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <Checkbox
                          checked={column.visible}
                          onCheckedChange={() => handleToggleColumn(column.key)}
                        />
                        <span className="text-sm flex-1 text-kumo-default">
                          {column.label}
                          {column.monospace && (
                            <span className="ml-2 text-xs text-kumo-inactive">(monospace)</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  
                  <p className="text-xs text-kumo-inactive mt-4">
                    {visibleCount} of {columns.length} columns visible
                  </p>
                </div>
              )}

              {/* Server Tab */}
              {activeTab === 'server' && (
                <div>
                  <p className="text-sm text-kumo-subtle mb-4">
                    Configure server and buffer settings. Changes to port require a server restart.
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Server Port
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={serverPort}
                        onChange={(e) => {
                          setServerPort(parseInt(e.target.value) || 8080);
                          setServerDirty(true);
                        }}
                        aria-label="Server port"
                        className="w-32"
                      />
                      <p className="text-xs text-kumo-inactive mt-1">
                        HTTP server listening port (1-65535). Requires restart.
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Buffer Size (MB)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={bufferSizeMB}
                        onChange={(e) => {
                          setBufferSizeMB(parseInt(e.target.value) || 100);
                          setServerDirty(true);
                        }}
                        aria-label="Buffer size in megabytes"
                        className="w-32"
                      />
                      <p className="text-xs text-kumo-inactive mt-1">
                        Maximum memory for log storage. Older logs are evicted when limit is reached. Requires restart.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Retention Period (days)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={retentionDays}
                        onChange={(e) => {
                          setRetentionDays(parseInt(e.target.value) || 0);
                          setServerDirty(true);
                        }}
                        aria-label="Retention period in days"
                        className="w-32"
                      />
                      <p className="text-xs text-kumo-inactive mt-1">
                        Maximum age for log entries. Logs older than this are automatically evicted. Set to 0 to disable time-based eviction. Requires restart.
                      </p>
                    </div>

                    <div className="border-t border-kumo-line pt-4 mt-4">
                      <h4 className="text-sm font-medium text-kumo-default mb-3">Buffer Persistence</h4>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-kumo-default mb-2">
                            Persistence File Path
                          </label>
                          <Input
                            type="text"
                            value={persistPath}
                            onChange={(e) => {
                              setPersistPath(e.target.value);
                              setServerDirty(true);
                            }}
                            placeholder="e.g., ~/.config/logtail/buffer.dat"
                            aria-label="Persistence file path"
                            className="w-full"
                          />
                          <p className="text-xs text-kumo-inactive mt-1">
                            File path to save buffer on shutdown and restore on startup. Leave empty to disable persistence.
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-kumo-default mb-2">
                            Auto-Save Interval (minutes)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={1440}
                            value={autoSaveMinutes}
                            onChange={(e) => {
                              setAutoSaveMinutes(parseInt(e.target.value) || 0);
                              setServerDirty(true);
                            }}
                            aria-label="Auto-save interval in minutes"
                            className="w-32"
                          />
                          <p className="text-xs text-kumo-inactive mt-1">
                            Periodically save buffer to disk. Set to 0 to disable (only saves on shutdown). Requires restart.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                  </div>
                </div>
              )}

              {/* Auth Token Tab */}
              {activeTab === 'auth' && (
                <div>
                  <p className="text-sm text-kumo-subtle mb-4">
                    Configure the authentication token required for the ingest endpoint.
                    When set, all ingest requests must include this token in the Authorization header.
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Authorization Token
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showToken ? 'text' : 'password'}
                            value={authToken}
                            onChange={(e) => {
                              setAuthToken(e.target.value);
                              setTokenDirty(true);
                            }}
                            placeholder={backendConfig?.ingest.hasAuthToken ? '(token configured)' : 'Enter token...'}
                            className="pr-10"
                            aria-label="Authorization token"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-kumo-subtle hover:text-kumo-default"
                            aria-label={showToken ? 'Hide token' : 'Show token'}
                          >
                            {showToken ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-kumo-inactive mt-1">
                        Status: {backendConfig?.ingest.hasAuthToken 
                          ? <span className="text-kumo-success">Token configured</span>
                          : <span className="text-kumo-warning">No token (unauthenticated access)</span>
                        }
                      </p>
                    </div>
                    
                    {backendConfig?.ingest.hasAuthToken && (
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearToken}
                          disabled={saving}
                        >
                          Clear Token
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Exclusions Tab */}
              {activeTab === 'exclusions' && (
                <div>
                  <p className="text-sm text-kumo-subtle mb-4">
                    Define strings that will cause log messages to be discarded during ingestion.
                    If an incoming log contains any of these strings (case-insensitive), it will not be stored.
                  </p>
                  
                  <div className="space-y-4">
                    {/* Add new pattern */}
                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Add Exclusion Pattern
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={newPattern}
                          onChange={(e) => setNewPattern(e.target.value)}
                          placeholder="e.g., healthcheck, DEBUG, /api/ping"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPattern();
                            }
                          }}
                          aria-label="New exclusion pattern"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={handleAddPattern}
                          disabled={!newPattern.trim()}
                          aria-label="Add pattern"
                        >
                          <PlusIcon size={16} />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Pattern list */}
                    <div>
                      <label className="block text-sm font-medium text-kumo-default mb-2">
                        Active Exclusion Patterns ({exclusionPatterns.length})
                      </label>
                      {exclusionPatterns.length === 0 ? (
                        <p className="text-sm text-kumo-inactive py-4 text-center border border-dashed border-kumo-line rounded">
                          No exclusion patterns configured. All logs will be stored.
                        </p>
                      ) : (
                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                          {exclusionPatterns.map((pattern, index) => (
                            <li
                              key={index}
                              className="flex items-center justify-between gap-2 px-3 py-2 bg-kumo-tint rounded border border-kumo-line"
                            >
                              <code className="text-sm font-mono text-kumo-default truncate flex-1">
                                {pattern}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                shape="square"
                                onClick={() => handleRemovePattern(index)}
                                aria-label={`Remove pattern "${pattern}"`}
                                className="text-kumo-danger hover:bg-kumo-danger-tint"
                              >
                                <TrashIcon size={14} />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-kumo-line bg-kumo-tint">
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                variant="primary"
                disabled={saving}
                onClick={async (e) => {
                  if (hasUnsavedChanges) {
                    e.preventDefault();
                    await handleSaveAll();
                    setIsOpen(false);
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
