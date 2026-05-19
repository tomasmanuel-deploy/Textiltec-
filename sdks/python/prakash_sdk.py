import os
import requests
import json
from typing import Optional, Dict, Any, Union

class PrakashSDK:
    def __init__(self, tenant_id: str = None, api_key: str = None, endpoint: str = None):
        """
        Initialize the Prakash SDK client for Python.
        
        :param tenant_id: The unique identifier for the tenant (optional, defaults to env PRAKASH_TENANT_ID)
        :param api_key: The API key for authentication (optional, defaults to env PRAKASH_API_KEY)
        :param endpoint: The central dashboard API endpoint (optional, defaults to production URL)
        """
        self.tenant_id = tenant_id or os.getenv('PRAKASH_TENANT_ID')
        self.api_key = api_key or os.getenv('PRAKASH_API_KEY')
        self.endpoint = endpoint or 'https://dashboard.prakash.com/api/central/ingest'
        
        if not self.tenant_id:
            raise ValueError("Tenant ID is required. Pass it in init or set PRAKASH_TENANT_ID environment variable.")

    def log_submission(self, document_id: str, status: str, details: Optional[Dict[str, Any]] = None):
        """
        Log a document submission event.
        
        :param document_id: The unique ID of the document (e.g. invoice number)
        :param status: The status of the submission ('success' or 'failure')
        :param details: Additional details about the submission
        """
        payload = {
            'tenantId': self.tenant_id,
            'eventType': 'submission',
            'documentId': document_id,
            'status': status,
            'details': details or {}
        }
        return self._send_event(payload)

    def log_error(self, context: str, error: Union[Exception, str]):
        """
        Log an error event.
        
        :param context: Where the error occurred
        :param error: The error object or message
        """
        error_message = str(error)
        stack_trace = getattr(error, '__traceback__', None) if isinstance(error, Exception) else None
        
        payload = {
            'tenantId': self.tenant_id,
            'eventType': 'error',
            'status': 'failure',
            'details': {
                'context': context,
                'errorMessage': error_message,
                'stack': str(stack_trace) if stack_trace else None
            }
        }
        return self._send_event(payload)

    def _send_event(self, payload: Dict[str, Any]):
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key or ""}',
            'X-Tenant-ID': self.tenant_id
        }
        
        try:
            response = requests.post(self.endpoint, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Failed to log event to Prakash Dashboard: {e}")
            return None

# Usage Example:
if __name__ == "__main__":
    sdk = PrakashSDK(tenant_id="test-tenant-123", api_key="secret-key")
    sdk.log_submission("INV-2024-001", "success", {"amount": 1000})
