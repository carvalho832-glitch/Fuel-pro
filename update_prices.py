import json
import requests
from bs4 import BeautifulSoup
import re
import time

def scrape_precos():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    try:
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        postos_encontrados = []
        
        # Encontra os blocos de postos
        cards = soup.find_all('div', class_=re.compile('fuel-station-card|card'))

        for card in cards[:10]: # Pegando os 10 primeiros para não travar
            try:
                nome = card.find(['h2', 'h3']).get_text().strip()
                # Pega o preço
                price_text = card.find('span', class_=re.compile('price|value')).get_text()
                preco = re.search(r'\d[,\.]\d+', price_text).group().replace(',', '.')
                
                # Pega o endereço (se disponível no card)
                address_elem = card.find('p', class_=re.compile('address|location'))
                endereco = address_elem.get_text().strip() if address_elem else ""
                
                # Lógica de coordenadas (usando bairros como referência por enquanto)
                lat, lng = -23.189, -45.884 # Default SJC
                
                full_text = (nome + " " + endereco).upper()
                if "AQUARIUS" in full_text: lat, lng = -23.219, -45.908
                elif "ADYANA" in full_text: lat, lng = -23.199, -45.895
                elif "CENTRO" in full_text: lat, lng = -23.185, -45.890
                elif "VILA INDUSTRIAL" in full_text: lat, lng = -23.178, -45.865
                elif "SATELITE" in full_text: lat, lng = -23.232, -45.912
                elif "ROSSI" in full_text: lat, lng = -23.172, -45.882
                
                postos_encontrados.append({
                    "name": nome,
                    "address": endereco,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.73, 2)), # Cálculo estimado
                        "gnv": "4.19", "die": "5.95", "gas_ad": str(round(float(preco) + 0.20, 2)), "eta_ad": "3.89"
                    }
                })
                time.sleep(0.1) # Evita ser bloqueado pelo site
            except:
                continue

        return postos_encontrados
    except Exception as e:
        print(f"Erro: {e}")
        return []

def atualizar():
    dados = scrape_precos()
    if dados:
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(dados, f, indent=2, ensure_ascii=False)
        print("Sucesso!")

if __name__ == "__main__":
    atualizar()
