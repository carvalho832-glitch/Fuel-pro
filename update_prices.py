import json
import requests
from bs4 import BeautifulSoup
import re

def scrape_real():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        postos_novos = []
        
        # O robô procura todos os blocos de postos na página
        itens = soup.find_all('div', class_=re.compile('card|fuel-station'))

        for item in itens:
            try:
                nome = item.find(['h2', 'h3']).get_text().strip()
                preco_raw = item.find('span', class_=re.compile('price|value')).get_text()
                # Extrai apenas os números (ex: 5,79)
                preco = re.search(r'\d[,\.]\d+', preco_raw).group().replace(',', '.')
                
                # Coordenadas aproximadas para não ficarem todos no mesmo sítio
                lat, lng = -23.189, -45.884
                if "AQUARIUS" in nome.upper(): lat, lng = -23.219, -45.908
                elif "ADYANA" in nome.upper(): lat, lng = -23.199, -45.895
                elif "CENTRO" in nome.upper(): lat, lng = -23.185, -45.890
                elif "ROSSI" in nome.upper(): lat, lng = -23.170, -45.880
                
                postos_novos.append({
                    "name": nome,
                    "lat": lat,
                    "lng": lng,
                    "prices": {"gas": preco, "eta": str(round(float(preco)*0.7,2))}
                })
            except: continue
        return postos_novos
    except: return []

novos = scrape_real()
if novos:
    with open('dados.json', 'w', encoding='utf-8') as f:
        json.dump(novos, f, indent=2, ensure_ascii=False)
