import json
import requests
from bs4 import BeautifulSoup
import re

def scrape_real():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    # Cabeçalho para o site não perceber que é um robô
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
    
    try:
        print(f"Acessando: {url}")
        response = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Tenta encontrar todos os blocos que podem ser postos
        postos_novos = []
        
        # Procura por elementos que contenham "R$" (geralmente onde está o preço)
        elementos_preco = soup.find_all(string=re.compile(r'R\$'))
        print(f"Elementos com R$ encontrados: {len(elementos_preco)}")

        for el in elementos_preco:
            try:
                # Sobe no código para achar o container do posto
                parent = el.find_parent(['div', 'section', 'li'])
                if not parent: continue
                
                texto_bloco = parent.get_text()
                
                # Procura o nome (Geralmente em um H2 ou H3)
                nome_elem = parent.find(['h1', 'h2', 'h3', 'strong'])
                if not nome_elem: continue
                nome = nome_elem.get_text().strip()
                
                # Extrai o preço (ex: 5,79)
                preco_match = re.search(r'\d[,\.]\d{2,3}', texto_bloco)
                if not preco_match: continue
                preco = preco_match.group().replace(',', '.')

                # Evita duplicados
                if any(p['name'] == nome for p in postos_novos): continue

                # Coordenadas de segurança
                lat, lng = -23.189, -45.884
                if "AQUARIUS" in nome.upper(): lat, lng = -23.219, -45.908
                elif "ADYANA" in nome.upper(): lat, lng = -23.199, -45.895
                elif "CENTRO" in nome.upper(): lat, lng = -23.185, -45.890
                elif "SATELITE" in nome.upper(): lat, lng = -23.232, -45.912
                elif "ROSSI" in nome.upper(): lat, lng = -23.172, -45.882

                postos_novos.append({
                    "name": nome,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.72, 2)), # Estimativa
                        "gas_ad": str(round(float(preco) + 0.20, 2))
                    }
                })
            except Exception as e:
                continue

        return postos_novos
    except Exception as e:
        print(f"Erro geral: {e}")
        return []

# Execução
if __name__ == "__main__":
    novos_dados = scrape_real()
    if novos_dados:
        print(f"Sucesso! Encontrados {len(novos_dados)} postos.")
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(novos_dados, f, indent=2, ensure_ascii=False)
    else:
        print("ALERTA: O robô não encontrou nenhum posto no site. Verifique o log.")
