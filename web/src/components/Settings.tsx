import { useState, useEffect, useCallback } from 'react';
import { Dialog, Checkbox, Button, Input } from '@cloudflare/kumo';
import { GearSix, X, Plus, Trash, Eye, EyeSlash, ShieldCheck, Columns, Funnel } from '@phosphor-icons/react';
import type { ColumnConfig } from '../types';

// Settings from the backend
interface BackendSettings {
  hasIngestToken: boolean;
  exclusionPatterns: string[];
}

interface SettingsProps {
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onResetColumns?: () => void;
}

type TabId = 'columns' | 'auth' | 'exclusions';

export function Settings({
  columns,
  onColumnsChange,
  onResetColumns,
}: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('columns');
  
  // Backend settings state
  const [backendSettings, setBackendSettings] = useState<BackendSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Auth token state
  const [authToken, setAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenDirty, setTokenDirty] = useState(false);
  
  // Exclusion patterns state
  const [exclusionPatterns, setExclusionPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [exclusionsDirty, setExclusionsDirty] = useState(false);

  // Fetch backend settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data: BackendSettings = await response.json();
        setBackendSettings(data);
        setExclusionPatterns(data.exclusionPatterns || []);
        setExclusionsDirty(false);
        // Don't set authToken - we never receive the actual token from backend
        setAuthToken('');
        setTokenDirty(false);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: { ingestToken?: string; exclusionPatterns?: string[] }) => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const data: BackendSettings = await response.json();
        setBackendSettings(data);
        setExclusionPatterns(data.exclusionPatterns || []);
        setExclusionsDirty(false);
        if (updates.ingestToken !== undefined) {
          setAuthToken('');
          setTokenDirty(false);
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
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
  const handleSaveToken = () => {
    saveSettings({ ingestToken: authToken });
  };

  const handleClearToken = () => {
    saveSettings({ ingestToken: '' });
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

  const handleSaveExclusions = () => {
    saveSettings({ exclusionPatterns });
  };

  const visibleCount = columns.filter(c => c.visible).length;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'columns', label: 'Columns', icon: <Columns size={16} /> },
    { id: 'auth', label: 'Ingest Auth', icon: <ShieldCheck size={16} /> },
    { id: 'exclusions', label: 'Exclusions', icon: <Funnel size={16} /> },
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger
        render={(props) => (
          <Button {...props} variant="outline" className="flex items-center gap-2">
            <GearSix size={16} />
            Settings
          </Button>
        )}
      />
      <Dialog className="p-0 overflow-hidden" size="lg">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <Dialog.Title className="text-xl font-semibold text-kumo-default">
            Settings
          </Dialog.Title>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                aria-label="Close"
                variant="secondary"
                shape="square"
                icon={<X size={16} />}
              />
            )}
          />
        </div>

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
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
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
                            placeholder={backendSettings?.hasIngestToken ? '(token configured)' : 'Enter token...'}
                            className="pr-10"
                            aria-label="Authorization token"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-kumo-subtle hover:text-kumo-default"
                            aria-label={showToken ? 'Hide token' : 'Show token'}
                          >
                            {showToken ? <EyeSlash size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-kumo-inactive mt-1">
                        Status: {backendSettings?.hasIngestToken 
                          ? <span className="text-kumo-success">Token configured</span>
                          : <span className="text-kumo-warning">No token (unauthenticated access)</span>
                        }
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveToken}
                        disabled={!tokenDirty || saving}
                      >
                        {saving ? 'Saving...' : 'Save Token'}
                      </Button>
                      {backendSettings?.hasIngestToken && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearToken}
                          disabled={saving}
                        >
                          Clear Token
                        </Button>
                      )}
                    </div>
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
                          <Plus size={16} />
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
                                <Trash size={14} />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    
                    {/* Save button */}
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveExclusions}
                        disabled={!exclusionsDirty || saving}
                      >
                        {saving ? 'Saving...' : 'Save Exclusions'}
                      </Button>
                      {exclusionsDirty && (
                        <span className="text-xs text-kumo-warning self-center">
                          Unsaved changes
                        </span>
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
              <Button {...props} variant="primary">
                Done
              </Button>
            )}
          />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
