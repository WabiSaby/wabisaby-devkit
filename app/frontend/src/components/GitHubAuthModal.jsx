import React, { useState, useCallback } from 'react';
import { Github, ExternalLink, Copy, AlertTriangle, X } from 'lucide-react';
import { github } from '../lib/wails';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { usePermissions } from '../context/PermissionsContext';

/**
 * GitHub Authentication Modal
 * Shown when user is not authenticated.
 * Displays a centered modal with device flow authentication.
 */
export function GitHubAuthModal({ isOpen }) {
  const [connecting, setConnecting] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { setPermissions } = usePermissions();

  const openExternal = useCallback((url) => {
    if (window.runtime?.BrowserOpenURL) {
      BrowserOpenURL(url);
      return;
    }
    window.open(url, '_blank');
  }, []);

  const startGitHubConnect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    setDeviceFlow(null);

    const { success, data, message } = await github.startDeviceFlow();
    if (!success) {
      setError(message || 'Failed to start GitHub connection');
      setConnecting(false);
      return;
    }

    setDeviceFlow(data);

    // Open verification URL in browser
    try {
      openExternal(data.verificationUri);
    } catch {
      /* ignore */
    }

    // Start polling in background
    const pollResult = await github.pollAuth();
    if (pollResult.success) {
      setPermissions(pollResult.data);
      setDeviceFlow(null);
      setError(null);
    } else {
      setError(pollResult.message || 'GitHub authorisation failed');
    }
    setConnecting(false);
  }, [openExternal, setPermissions]);

  const copyCode = useCallback((code) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="github-auth-modal">
      <div className="github-auth-modal__overlay" />
      <div className="github-auth-modal__container">
        <div className="github-auth-modal__content">
          {!deviceFlow ? (
            <>
              <div className="github-auth-modal__header">
                <div className="github-auth-modal__icon-wrapper">
                  <Github size={28} />
                </div>
                <div className="github-auth-modal__title-group">
                  <h2 className="github-auth-modal__title">Sign in to continue</h2>
                  <p className="github-auth-modal__subtitle">
                    Connect your GitHub account to access DevKit.
                  </p>
                </div>
              </div>

              <div className="github-auth-modal__body">
                <p className="github-auth-modal__description">
                  Your GitHub identity determines project access and permissions.
                </p>
              </div>

              <div className="github-auth-modal__footer">
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={startGitHubConnect}
                  disabled={connecting}
                >
                  <Github size={16} />
                  {connecting ? 'Connecting...' : 'Sign in with GitHub'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="github-auth-modal__header">
                <div className="github-auth-modal__icon-wrapper github-auth-modal__icon-wrapper--secondary">
                  <ExternalLink size={26} />
                </div>
                <div className="github-auth-modal__title-group">
                  <h2 className="github-auth-modal__title">Authorize DevKit</h2>
                  <p className="github-auth-modal__subtitle">
                    Enter the code below on GitHub to finish signing in.
                  </p>
                </div>
              </div>

              <div className="github-auth-modal__body">
                <div className="github-auth-modal__code-container">
                  <code className="github-auth-modal__code">{deviceFlow.userCode}</code>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => copyCode(deviceFlow.userCode)}
                  >
                    <Copy size={14} />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={() => openExternal(deviceFlow.verificationUri)}
                >
                  <ExternalLink size={16} />
                  Open GitHub
                </button>

                <p className="github-auth-modal__waiting">
                  Waiting for authorization...
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="github-auth-modal__error">
              <div className="banner banner--error">
                <div className="banner__content">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="btn btn--ghost"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
