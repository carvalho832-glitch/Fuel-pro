import json
import requests
from bs4 import BeautifulSoup
import re
import time

def buscar_coordenadas(nome_posto, endereco_bruto):
    """Tenta achar a localização exata, com fallback para o bairro"""
    # Limpa o endereço para o mapa entender melhor
    endereco = endereco_bruto.split('-')[0].split(',')[0] # Pega só a rua e número
    endereco = re.sub(r' (S/N|SN|QD|LT).*', '', endereco, flags=re.I)
    
    queries = [
        f"{endereco}, Sao Jose dos Campos, Brazil",
        f"{nome_posto}, Sao Jose dos Campos, Brazil",
        f"{endereco_bruto}, Sao Jose dos Campos, Brazil"
    ]
    
    headers = {'User-Agent': 'FuelPro_SJC_Bot_v2'}
    
    for q in queries:
        try:
            url = f"https://nominatim.openstreetmap.org/search?format=json&q={q}"
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()
            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
            time.sleep(1) # Respeita o limite do serviço
        except:
            continue
    return None, None

def scrape_real():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    try:
        response = requests.get(url, headers=headers, timeout=20)
        soup = BeautifulSoup(response.text, 'html.parser')
        postos_novos = []
        
        # Procura os blocos de postos por preço
        precos_encontrados = soup.find_all(string=re.compile(r'R\$'))
        
        print(f"Iniciando varredura em {len(precos_encontrados)} possíveis preços...")

        for el in precos_encontrados[:20]: # Foco nos 20 primeiros
            try:
                card = el.find_parent(['div', 'a', 'section'])
                texto_card = card.get_text(separator=" ")
                
                # Preço
                preco_match = re.search(r'R\$\s?(\d[,\.]\d{2})', texto_card)
                if not preco_match: continue
                preco = preco_match.group(1).replace(',', '.')

                # Nome
                nome_elem = card.find(['h2', 'h3', 'h4', 'strong', 'b'])
                nome = nome_elem.get_text().strip().upper() if nome_elem else "POSTO"
                if "R$" in nome: nome = "POSTO SJC"

                # Endereço
                info_texto = card.find_all(['p', 'span', 'small'])
                endereco = ""
                for info in info_texto:
                    t = info.get_text().strip()
                    if any(word in t.upper() for word in ["RUA", "AV", "ESTRADA", "PRAÇA", "JD", "VILA"]):
                        endereco = t
                        break

                if not endereco or any(p['name'] == nome for p in postos_novos):
                    continue

                print(f"-> Localizando: {nome} ({endereco})")
                lat, lng = buscar_coordenadas(nome, endereco)
                
                # Se ainda não achar, coloca no centro de SJC para não perder o dado
                if not lat:
                    print(f"   ! Não localizado. Usando posição aproximada.")
                    lat, lng = -23.189, -45.884

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
        print(f"SUCESSO! {len(resultado)} postos carregados no sistema.")
