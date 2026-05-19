import pandas as pd
import json

try:
    df = pd.read_excel('/Users/rajan/Downloads/Arredondamento Partilha.xlsx', engine='openpyxl')
    # Convert to JSON string
    print(df.head(30).to_json(orient='records', indent=2))
except Exception as e:
    print(f"Error: {e}")
