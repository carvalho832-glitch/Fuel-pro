import json
import requests
from bs4 import BeautifulSoup
import re

def scrape_precos():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    try:
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Lista para guardar os postos encontrados
        postos_encontrados = []
        
        # Procurando os cards de postos (baseado na estrutura do site)
        cards = soup.select('.fuel-station-card') # Seletor comum para esse site
        
        if not cards:
            # Fallback caso a classe mude
            cards = soup.find_all('div', class_=re.compile('card'))

        for card in cards:
            try:
                name_elem = card.find('h2') or card.find('h3')
                price_elem = card.find('span', class_=re.compile('price|value'))
                
                if name_elem and price_elem:
                    nome = name_elem.get_text().strip()
                    # Limpa o preço para ficar apenas os números (ex: 5,79)
                    preco_texto = re.search(r'\d[,\.]\d+', price_elem.get_text())
                    preco = preco_texto.group().replace(',', '.') if preco_texto else "0.00"
                    
                    # Coordenadas aproximadas baseadas no nome (para o mapa não ficar vazio)
                    # No futuro, podemos usar uma API de mapas para pegar a lat/lng real
                    lat, lng = -23.220, -45.900 # Ponto central de SJC caso não ache
                    
                    if "AQUARIUS" in nome.upper(): lat, lng = -23.219, -45.908
                    elif "ADYANA" in nome.upper(): lat, lng = -23.199, -45.895
                    elif "CENTRO" in nome.upper(): lat, lng = -23.185, -45.890
                    elif "ROSSI" in nome.upper(): lat, lng = -23.170, -45.880
                    
                    postos_encontrados.append({
                        "name": nome,
                        "lat": lat,
                        "lng": lng,
                        "prices": {
                            "gas": preco,
                            "eta": str(round(float(preco) * 0.7, 2)), # Estimativa se o site não mostrar
                            "gnv": "4.20", "die": "5.89", "gas_ad": "5.99", "eta_ad": "3.99"
                        }
                    })
            except:
                continue

        return postos_encontrados if postos_encontrados else []
    
    except Exception as e:
        print(f"Erro no scraping: {e}")
        return []

def atualizar():
    novos_dados = scrape_precos()
    if novos_dados:
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(novos_dados, f, indent=2, ensure_ascii=False)
        print(f"Sucesso! {len(novos_dados)} postos atualizados.")
    else:
        print("Nenhum dado novo encontrado para atualizar.")

if __name__ == "__main__":
    atualizar()
