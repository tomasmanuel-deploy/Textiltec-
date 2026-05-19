#!/bin/bash

echo "--- 1. Submitting Recibo de Estorno (RE) to provided URL ---"
echo "URL: https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura"
curl -k -v -X POST "https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -H "Content-Type: application/json" \
     -d @AGT_Recibo_Estorno.json

echo "\n\n--- 2. Submitting Outros Recibos (RG) to provided URL ---"
echo "URL: https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura"
curl -k -v -X POST "https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -H "Content-Type: application/json" \
     -d @AGT_Outros_Recibos.json

echo "\n\n--- 3. Testing Alternative URL (removing /ws/) for REST JSON ---"
echo "URL: https://sifphml.minfin.gov.ao/sigt/fe/v1/registarFactura"
curl -k -v -X POST "https://sifphml.minfin.gov.ao/sigt/fe/v1/registarFactura" \
     -H "Content-Type: application/json" \
     -d @AGT_Recibo_Estorno.json
