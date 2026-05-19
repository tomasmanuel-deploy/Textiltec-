import json
import base64
import datetime
import hashlib
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
import requests

# Load Private Key
KEY_PATH = "data/agt_keys/private.pem"

try:
    with open(KEY_PATH, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None
        )
except FileNotFoundError:
    print(f"Error: Private key not found at {KEY_PATH}")
    exit(1)

# Function to sign content (RS256)
def sign_content(content_str):
    signature = private_key.sign(
        content_str.encode('utf-8'),
        padding.PKCS1v15(),
        hashes.SHA256()
    )
    # JWS Signature format often requires Base64URL encoding without padding
    return base64.urlsafe_b64encode(signature).decode('utf-8').rstrip("=")

# 1. Prepare Solicitar Série Payload
# According to documentation, we need to sign specific fields for 'jwsSignature'
# Fields: taxRegistrationNumber + establishmentNumber + seriesYear + documentType
# And 'jwsSoftwareSignature' signs the whole softwareInfo object (or specific fields depending on interpretation, 
# usually canonical JSON of softwareInfo)

# Let's read the base JSON template
with open("AGT_Solicitar_Serie.json", "r") as f:
    payload = json.load(f)

# Update timestamps and dynamic values
payload["submissionTimeStamp"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

# --- SIGNING LOGIC ---

# 1. Sign Software Info (jwsSoftwareSignature)
# "Todos os campos do objecto softwareInfo devem ser usados na assinatura."
# We'll create a concatenated string or canonical JSON of softwareInfoDetail
sw_info = payload["softwareInfo"]["softwareInfoDetail"]
# Concatenation strategy (common in AGT): productId + productVersion + softwareValidationNumber
sw_data_to_sign = f"{sw_info['productId']}{sw_info['productVersion']}{sw_info['softwareValidationNumber']}"
# Alternatively, it might be the whole JSON object. Let's try concatenation first as it's typical for AGT.
# UPDATE: The doc says "Todos os campos...". Let's stick to the concatenation order or canonical JSON.
# Safest bet for 'softwareInfo' is often canonical JSON.
sw_signature = sign_content(json.dumps(payload["softwareInfo"]["softwareInfoDetail"], separators=(',', ':')))
payload["softwareInfo"]["jwsSoftwareSignature"] = sw_signature

# 2. Sign Request (jwsSignature)
# "Os campos da solicitação a serem utilizados na assinatura são: taxRegistrationNumber, establishmentNumber, seriesYear, documentType"
req_data_to_sign = f"{payload['taxRegistrationNumber']}{payload['establishmentNumber']}{payload['seriesYear']}{payload['documentType']}"
req_signature = sign_content(req_data_to_sign)
payload["jwsSignature"] = req_signature

print("--- Generated Payload with Signatures ---")
print(json.dumps(payload, indent=2))

# --- SUBMISSION ---
url = "https://sifphml.minfin.gov.ao/sigt/fe/v1/solicitarSerie"
headers = {
    "Content-Type": "application/json"
    # Note: Authorization header would be needed here if we had a token
}

print(f"\n--- Submitting to {url} ---")
try:
    response = requests.post(url, json=payload, headers=headers, verify=False)
    print(f"Status Code: {response.status_code}")
    print("Response Headers:", response.headers)
    print("Response Body:", response.text)
except Exception as e:
    print(f"Submission failed: {e}")
