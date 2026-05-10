import json
import requests
from bs4 import BeautifulSoup
import re
import time

def buscar_coords(texto_busca):
    """Procura a localização exata no mapa"""
    try:
        # Limpa o endereço para o mapa entender (remove números de telefone ou detalhes)
        busca = texto_busca.split(',')[0].split('-')[0].strip()
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={busca}, Sao Jose dos Campos"
        res = requests.get(url, headers={'User-Agent': 'FuelPro_SJC_Bot'}, timeout=10)
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
        print(f"Aceder ao site: {url}")
        res = requests.get(url, headers=headers, timeout=20)
        soup = BeautifulSoup(res.text, 'html.parser')
        postos_final = []
        
        # O TRUQUE: Procurar por todos os textos que tenham "R$"
        precos_encontrados = soup.find_all(string=re.compile(r'R\$'))
        print(f"Etiquetas de preço encontradas: {len(precos_encontrados)}")

        for item in precos_encontrados:
            try:
                # Sobe no código para encontrar o "card" (o bloco do posto)
                card = item.find_parent(['div', 'section', 'a'])
                if not card: continue
                
                texto_bloco = card.get_text(separator=" ").upper()
                
                # 1. EXTRAIR PREÇO
                p_match = re.search(r'R\$\s?(\d[,\.]\d{2})', texto_bloco)
                if not p_match: continue
                preco = p_match.group(1).replace(',', '.')

                # 2. EXTRAIR NOME (Geralmente o primeiro texto em destaque no bloco)
                nome_el = card.find(['h2', 'h3', 'h4', 'strong', 'b'])
                nome = nome_el.get_text().strip().upper() if nome_el else "POSTO GASOLINA"
                
                # Evitar lixo (se o nome for o próprio preço, ignoramos)
                if "R$" in nome or len(nome) < 3: continue

                # 3. EXTRAIR ENDEREÇO
                endereco = ""
                # Procuramos por textos que contenham palavras de morada
                for p in card.find_all(['p', 'span', 'div']):
                    t = p.get_text().upper()
                    if any(w in t for w in ["AVENIDA", "RUA", "ESTRADA", "PRAÇA", "JD", "VILA"]):
                        endereco = p.get_text().strip().replace('\n', ' ')
                        break

                # Evitar duplicados
                if any(p['name'] == nome for p in postos_final): continue

                print(f"-> A processar: {nome}")
                
                # 4. LOCALIZAÇÃO (Mapa)
                lat, lng = buscar_coords(f"{nome} {endereco}")
                if not lat:
                    # Se falhar a rua exata, tenta pelo menos o bairro ou fica no centro
                    lat, lng = -23.189, -45.884 

                postos_final.append({
                    "name": nome,
                    "address": endereco,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.73, 2)),
                        "gas_ad": str(round(float(preco) + 0.15, 2))
                    }
                })
                
                # Pausa para não ser bloqueado pelo serviço de mapas
                time.sleep(1.1)

            except Exception as e:
                continue

        return postos_final

    except Exception as e:
        print(f"Erro geral: {e}")
        return []

if __name__ == "__main__":
    resultado = scrape()
    if resultado:
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
        print(f"SUCESSO! {len(resultado)} postos guardados.")
    else:
        print("FALHA: O robô não conseguiu ler os dados.")
