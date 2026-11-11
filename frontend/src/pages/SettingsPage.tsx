import React, { useState, useEffect, useCallback } from 'react';
import {
  Save,
  RotateCw,
  CheckCircle2,
} from 'lucide-react';
import { settingsService, UpdateSettingsInput } from '../services/settingsService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Form states
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [scanMode, setScanMode] = useState<'full' | 'quick'>('full');
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [requireConfirmation, setRequireConfirmation] = useState<boolean>(true);
  const [notifyUpdates, setNotifyUpdates] = useState<boolean>(true);
  const [notifyFailures, setNotifyFailures] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(90);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await settingsService.getSettings();
      setTheme(data.theme);
      setScanMode(data.scanPreferences?.scanMode || 'full');
      setIntervalDays(data.scanPreferences?.scheduleIntervalDays || 7);
      setRequireConfirmation(data.requireUpdateConfirmation ?? true);
      setNotifyUpdates(data.notificationPreferences?.notifyOnUpdates ?? true);
      setNotifyFailures(data.notificationPreferences?.notifyOnFailures ?? true);
      setRetentionDays(data.dataRetentionDays || 90);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch user settings.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSavedSuccess(false);
      setError(null);

      const payload: UpdateSettingsInput = {
        theme,
        scanPreferences: {
          scanMode,
          scheduleIntervalDays: Number(intervalDays),
        },
        requireUpdateConfirmation: requireConfirmation,
        notificationPreferences: {
          notifyOnUpdates: notifyUpdates,
          notifyOnFailures: notifyFailures,
        },
        dataRetentionDays: Number(retentionDays),
      };

      await settingsService.updateSettings(payload);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update preferences.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure scan frequencies, update confirmation enforcement, and audit retention policies.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void fetchSettings()}
          icon={<RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Preferences updated and saved successfully!</span>
        </div>
      )}

      {error && <ErrorMessage error={error} />}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px]">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 mt-2 font-medium">Loading preferences...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: Scanning & Discovery */}
          <Card title="Scanning & Discovery Preferences">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Default Scan Mode</label>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => setScanMode('full')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      scanMode === 'full'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm">Full Scan</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Inspects all Windows registry hives and WinGet package databases.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScanMode('quick')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      scanMode === 'quick'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm">Quick Scan</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Scans only standard WinGet registered package catalogs.
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Schedule Interval (Days): {intervalDays} days
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="w-full max-w-md accent-indigo-600"
                />
              </div>
            </div>
          </Card>

          {/* Card 2: Security & Confirmation Policy */}
          <Card title="Update Execution Policy">
            <div className="space-y-4 text-xs">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireConfirmation}
                  onChange={(e) => setRequireConfirmation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-slate-900 text-sm block">
                    Enforce explicit two-step human confirmation
                  </span>
                  <span className="text-slate-500 text-xs">
                    Require single-use preview token verification before any update can be queued to the Windows agent.
                  </span>
                </div>
              </label>

              <div className="pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700 mb-1">
                  Data Retention Policy
                </label>
                <p className="text-slate-500 mb-2">
                  Retain scan snapshots and historical audit events for:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="7"
                    max="365"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-slate-600">days</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
