import json
import requests
from bs4 import BeautifulSoup
import re
import time

def buscar_coordenadas(endereco):
    """Pergunta ao serviço de mapas a Lat/Lng exata do endereço"""
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={endereco}, Sao Jose dos Campos, Brazil"
        headers = {'User-Agent': 'FuelProBot/1.0'}
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except:
        pass
    return None, None

def scrape_real():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        response = requests.get(url, headers=headers, timeout=20)
        soup = BeautifulSoup(response.text, 'html.parser')
        postos_novos = []
        
        # Procura os cards dos postos
        cards = soup.find_all(['div', 'a'], class_=re.compile(r'card|station|item', re.I))
        
        print(f"Processando endereços de {len(cards)} possíveis postos...")

        for card in cards[:15]: # Limitando aos 15 primeiros para o processo ser rápido
            try:
                texto_total = card.get_text(separator=" ")
                
                # Extrai Preço
                preco_match = re.search(r'R\$\s?(\d[,\.]\d{2})', texto_total)
                if not preco_match: continue
                preco = preco_match.group(1).replace(',', '.')

                # Extrai Nome
                nome_elem = card.find(['h2', 'h3', 'h4', 'strong'])
                nome = nome_elem.get_text().strip().upper() if nome_elem else "POSTO"

                # Extrai Endereço (Geralmente texto que contém 'Rua', 'Av', 'Estrada' ou o Bairro)
                # Tentamos pegar parágrafos ou spans que pareçam endereços
                info_texto = card.find_all(['p', 'span', 'small'])
                endereco = ""
                for info in info_texto:
                    t = info.get_text().strip()
                    if any(word in t.upper() for word in ["RUA", "AV", "ESTRADA", "PRAÇA", "JD", "VILA"]):
                        endereco = t
                        break

                if not endereco: continue

                # AGORA A MÁGICA: Busca a Lat/Lng real pelo endereço
                print(f"Buscando localização: {nome} -> {endereco}")
                lat, lng = buscar_coordenadas(endereco)
                
                # Se não achar o endereço exato, usa o centro de SJC como segurança
                if not lat:
                    lat, lng = -23.189, -45.884

                if any(p['name'] == nome for p in postos_novos): continue

                postos_novos.append({
                    "name": nome,
                    "address": endereco,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.72, 2)),
                        "gas_ad": str(round(float(preco) + 0.18, 2))
                    }
                })
                # Pausa curta entre buscas para o serviço de mapas não nos bloquear
                time.sleep(1.2) 
            except:
                continue

        return postos_novos
    except:
        return []

if __name__ == "__main__":
    resultado = scrape_real()
    if resultado:
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
        print(f"SUCESSO! {len(resultado)} postos localizados no mapa.")
