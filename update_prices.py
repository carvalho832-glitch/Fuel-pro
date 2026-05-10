import json
import requests
from bs4 import BeautifulSoup
import re
import time

def buscar_coords(endereco):
    """Tenta buscar no OpenStreetMap, mas não trava se falhar"""
    try:
        # Limpa o endereço para facilitar a busca (ex: tira o número da casa)
        busca = endereco.split('-')[0].split(',')[0]
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={busca}, Sao Jose dos Campos"
        res = requests.get(url, headers={'User-Agent': 'FuelPro_SJC'}, timeout=5)
        data = res.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except:
        pass
    return None, None

def scrape():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        print(f"Iniciando varredura no site...")
        res = requests.get(url, headers=headers, timeout=20)
        soup = BeautifulSoup(res.text, 'html.parser')
        postos_novos = []
        
        # Pega todos os blocos que parecem ser postos
        cards = soup.select('.fuel-station-card') or soup.find_all(['div', 'a'], class_=re.compile(r'card|item|station', re.I))
        
        print(f"Blocos detectados: {len(cards)}")

        for card in cards[:15]: # Vamos focar nos 15 primeiros para ser rápido
            try:
                texto_total = card.get_text(separator=" ")
                
                # 1. PEGA O PREÇO
                p_match = re.search(r'R\$\s?(\d[,\.]\d{2})', texto_total)
                if not p_match: continue
                preco = p_match.group(1).replace(',', '.')

                # 2. PEGA O NOME
                n_el = card.find(['h2', 'h3', 'h4', 'strong', 'b'])
                nome = n_el.get_text().strip().upper() if n_el else "POSTO SJC"
                if "R$" in nome: nome = "POSTO"

                # 3. PEGA O ENDEREÇO
                endereco = ""
                for p in card.find_all(['p', 'span', 'small']):
                    t = p.get_text().upper()
                    if any(w in t for w in ["AV", "RUA", "ESTRADA", "JD", "VILA", "SÃO JOSÉ"]):
                        endereco = p.get_text().strip()
                        break

                if any(p['name'] == nome for p in postos_novos): continue

                # 4. DEFINE AS COORDENADAS (Busca Real -> Bairro -> Centro SJC)
                print(f"-> Processando: {nome}")
                lat, lng = buscar_coords(endereco) if endereco else (None, None)
                
                if not lat:
                    # Fallback por palavras-chave se a busca no mapa falhar
                    if "AQUARIUS" in (nome + endereco).upper(): lat, lng = -23.219, -45.908
                    elif "ADYANA" in (nome + endereco).upper(): lat, lng = -23.199, -45.895
                    elif "CENTRO" in (nome + endereco).upper(): lat, lng = -23.185, -45.890
                    elif "SATELITE" in (nome + endereco).upper(): lat, lng = -23.232, -45.912
                    else: lat, lng = -23.189, -45.884 # Centro de SJC (Padrão)

                postos_novos.append({
                    "name": nome,
                    "address": endereco,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.72, 2)),
                        "gas_ad": str(round(float(preco) + 0.15, 2))
                    }
                })
                time.sleep(1) # Pausa obrigatória para o Nominatim
            except:
                continue

        return postos_novos
    except Exception as e:
        print(f"Erro no Scraper: {e}")
        return []

if __name__ == "__main__":
    resultado = scrape()
    if resultado:
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
        print(f"SUCESSO! {len(resultado)} postos capturados.")
    else:
        print("FALHA: NENHUM POSTO FOI SALVO.")
