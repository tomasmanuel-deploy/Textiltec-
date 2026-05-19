let privateKeyContent = null;

document.addEventListener('DOMContentLoaded', () => {
    const selectKeyBtn = document.getElementById('selectKeyBtn');
    const privateKeyPath = document.getElementById('privateKeyPath');
    const licenseForm = document.getElementById('licenseForm');
    const generateBtn = document.getElementById('generateBtn');
    const resultDiv = document.getElementById('result');

    selectKeyBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.selectPrivateKey();
            if (result) {
                privateKeyPath.value = result.path;
                privateKeyContent = result.content;
            }
        } catch (error) {
            showError('Failed to select private key: ' + error.message);
        }
    });

    licenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!privateKeyContent) {
            showError('Please select a private key file first.');
            return;
        }

        const duration = document.getElementById('duration').value;
        const product = document.getElementById('product').value;
        const issuer = document.getElementById('issuer').value;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';

        try {
            const machineCode = document.getElementById('machineCode').value;
            const result = await window.electronAPI.generateLicense({
                privateKeyPem: privateKeyContent,
                duration,
                product,
                issuer,
                machineCode
            });

            if (result.success) {
                showResult(result.token, result.payload);
            } else {
                showError('Generation failed: ' + result.error);
            }
        } catch (error) {
            showError('Generation failed: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate License Key';
        }
    });

    function showResult(token, payload) {
        const expiryDate = new Date(payload.exp).toLocaleString();
        const validFromDate = new Date(payload.nbf).toLocaleString();
        
        resultDiv.innerHTML = `
            <h3>✅ License Key Generated Successfully</h3>
            <div class="license-key">${token}</div>
            <div class="details">
                <div><strong>License ID:</strong> ${payload.licenseId}</div>
                <div><strong>Product:</strong> ${payload.product}</div>
                <div><strong>Issuer:</strong> ${payload.iss}</div>
                <div><strong>Valid From:</strong> ${validFromDate}</div>
                <div><strong>Expires:</strong> ${expiryDate}</div>
                <div><strong>Duration:</strong> ${payload.durationSeconds / 86400} days</div>
            </div>
            <div class="actions">
                <button class="btn btn-primary" onclick="copyToClipboard('${token}')">Copy Key</button>
                <button class="btn btn-secondary" onclick="saveToFile('${token}', '${payload.licenseId}')">Save to File</button>
            </div>
        `;
        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function showError(message) {
        resultDiv.innerHTML = `
            <h3>❌ Error</h3>
            <div style="color: #c53030; margin-top: 12px;">${message}</div>
        `;
        resultDiv.className = 'result error';
        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }

    window.copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showNotification('License key copied to clipboard!');
        } catch (error) {
            showError('Failed to copy to clipboard: ' + error.message);
        }
    };

    window.saveToFile = async (token, licenseId) => {
        try {
            const result = await window.electronAPI.saveLicense({
                token,
                filename: `${licenseId}-license-key.txt`
            });

            if (result.success && !result.canceled) {
                showNotification(`License key saved to: ${result.path}`);
            }
        } catch (error) {
            showError('Failed to save file: ' + error.message);
        }
    };

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #48bb78;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-weight: 600;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
});