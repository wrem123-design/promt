const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ITEMS_PATH = path.join(ROOT, 'data', 'items.json');
const SETTINGS_PATH = path.join(ROOT, 'data', 'settings.json');
const SECTION_KEYS = ['appearance', 'outfit', 'background', 'expression_pose', 'details'];

const BACKGROUND_REPAIRS = {
  'img-anvhaxa-mrqzbj97': {
    en: 'The setting is on a molded blue subway bench. The surrounding subway interior includes blue and cream plastic seats, white wall panels, large dark windows, stainless-steel vertical poles, metal armrests, ventilation grilles beneath the seats, emergency equipment, and partially visible Korean signs and safety notices.',
    ko: '배경은 파란색 성형 지하철 좌석 주변이며, 파란색과 크림색 플라스틱 좌석, 흰색 벽 패널, 커다란 어두운 창문, 스테인리스 스틸 수직 기둥, 금속 팔걸이, 좌석 아래 환기 그릴, 비상 장비, 부분적으로 보이는 한국어 표지판과 안전 안내문이 있습니다.',
  },
  'img-sjdt59b-mrqd5xyb': {
    en: 'The setting is at an indoor restaurant table with a warm wooden booth backrest, vertical wood paneling, gray stone wall blocks, tall bamboo plants, a softly lit corner, and ceramic dishes arranged on the table.',
    ko: '배경은 실내 레스토랑 테이블 주변이며, 따뜻한 나무 부스 등받이, 수직 나무 패널, 회색 석재 벽 블록, 높게 솟은 대나무 식물, 은은한 조명의 코너, 테이블에 놓인 도자기 그릇들이 있습니다.',
  },
  'img-l25atgn-mrqa776r': {
    en: 'The setting is on the speckled terrazzo floor of a quiet indoor hallway. The corridor contains a dark brown wooden baseboard, a long empty wall receding into the distance, and warm rectangular shafts of sunlight creating vertical shadow bands across the wall and floor.',
    ko: '배경은 조용한 실내 복도의 점박이 테라조 바닥 주변이며, 짙은 갈색 나무 걸레받이, 멀리 이어지는 긴 빈 벽, 벽과 바닥에 수직 그림자 띠를 만드는 따뜻한 직사각형 햇빛이 있습니다.',
  },
  'img-the22iw-mrq6nvbp': {
    en: 'The scene takes place in a softly lit entryway beside a slim console, where keys, a framed print, a textured wall, and an open doorway provide believable domestic detail. Pale wood, low modular furniture, sheer curtains, a chrome floor lamp, scattered magazines, and restrained clutter complete the environment.',
    ko: '장면은 은은한 조명의 현관과 슬림한 콘솔 주변이며, 열쇠, 액자, 질감이 느껴지는 벽, 열린 문이 사실적인 가정집 디테일을 더합니다. 밝은 원목, 낮은 모듈형 가구, 얇은 커튼, 크롬 플로어 램프, 여기저기 놓인 잡지와 절제된 생활 소품이 환경을 구성합니다.',
  },
  'img-0zjlgve-mrozix5h': {
    en: 'The setting is beside the entrance of a modern restaurant or cafe. The background includes a warm beige stone wall, a black metal-framed glass door, softly illuminated diners and interior furnishings visible through the doorway, and leafy green branches extending along the upper-right side.',
    ko: '배경은 현대적인 레스토랑 또는 카페 입구 옆이며, 따뜻한 베이지색 석벽, 검은색 금속 프레임 유리문, 문 너머로 보이는 은은한 조명의 식사 손님과 내부 가구, 오른쪽 상단을 따라 뻗은 푸른 잎사귀 가지가 있습니다.',
  },
  'img-61hr8n2-mrlyqw50': {
    en: 'The interior includes rich wood-paneled walls, a glass display cabinet filled with wine glasses and tumblers, a warm amber wall light, large green tropical plants, wooden furniture, and a polished concrete floor.',
    ko: '실내에는 짙은 나무 패널 벽, 와인잔과 텀블러가 정돈된 유리 진열장, 따뜻한 호박색 벽 조명, 커다란 초록 열대 식물, 나무 가구, 광택 콘크리트 바닥이 있습니다.',
  },
  'img-88kwk21-mrf3lczc': {
    en: 'The setting is on a large white textured sofa in a minimalist indoor space with soft cream walls. The environment is calm, bright, and uncluttered, with a soft luxury mood and a few delicate green leaves entering from the upper-left corner.',
    ko: '배경은 부드러운 크림색 벽이 있는 미니멀한 실내의 커다란 흰색 질감 소파 주변입니다. 환경은 차분하고 밝으며 정돈되어 있고, 왼쪽 상단에서 들어오는 몇 개의 섬세한 초록 잎사귀가 부드러운 고급스러운 분위기를 더합니다.',
  },
  'img-pgvd4cc-mrf15s5c': {
    en: 'The setting is on a dark green metal mesh chair at a matching cafe table in a spacious indoor atrium or shopping-mall courtyard with large tropical plants, tiled herringbone flooring, structural columns, and a bakery kiosk in the distance.',
    ko: '배경은 넓은 실내 아트리움 또는 쇼핑몰 중정의 짙은 초록색 금속 메시 의자와 같은 색 카페 테이블 주변이며, 커다란 열대 식물, 헤링본 타일 바닥, 구조 기둥, 멀리 보이는 베이커리 키오스크가 있습니다.',
  },
  'img-b0ljr8v-mrc7nond': {
    en: 'The setting is on the wooden floor platform of an open pavilion gazebo with thick vertical posts, dark wooden railings, and plank flooring, surrounded by pine trees, green grass, a distant tree-covered hillside, and a light cream-colored house.',
    ko: '배경은 굵은 수직 기둥, 어두운 나무 난간, 판자 바닥이 있는 개방형 정자 가제보의 나무 플랫폼이며, 주변에는 소나무, 초록 잔디, 멀리 나무로 덮인 언덕과 연한 크림색 집이 있습니다.',
  },
  'img-zrlisx0-mrc77pwq': {
    en: 'The setting is in a gray upholstered armchair beside a large cafe window, with the city street visible outside.',
    ko: '배경은 커다란 카페 창문 옆의 회색 패브릭 안락의자 주변이며, 창밖으로 도시 거리가 보입니다.',
  },
  'img-7e0mn8j-mrc6wo4x': {
    en: 'The setting is around a woven wicker chair at an outdoor garden cafe, with lush green plants and a wooden fence nearby.',
    ko: '배경은 야외 정원 카페의 짜임 고리버들 의자 주변이며, 무성한 초록 식물과 나무 울타리가 있습니다.',
  },
  'img-qffoge4-mrc72c0o': {
    en: 'The setting is on a clean white indoor bench against a plain pale mint-white wall. A small white table beside her holds two iced drinks, pastries, and fruit in a minimalist cafe dessert arrangement.',
    ko: '배경은 옅은 민트 화이트 벽 앞의 깨끗한 흰색 실내 벤치 주변이며, 옆의 작은 흰색 테이블에는 아이스 음료 두 잔과 페이스트리, 과일이 미니멀한 카페 디저트 구성으로 놓여 있습니다.',
  },
  'img-4k3dfas-mrc71u4j': {
    en: 'The setting is on a light gray fabric sofa in a modern indoor cafe with light wood-paneled walls, a potted green plant, and a metal magazine rack.',
    ko: '배경은 현대적인 실내 카페의 연회색 패브릭 소파 주변이며, 밝은 나무 패널 벽과 초록 화분, 금속 잡지꽂이가 있습니다.',
  },
  'img-q4e7mpf-mrc6wkep': {
    en: 'The setting is on a paved street beside a building with large windows and stone walls, with a small potted plant nearby.',
    ko: '배경은 큰 창문과 석재 벽이 있는 건물 옆 포장도로이며, 가까이에 작은 화분이 있습니다.',
  },
  'img-vkxd422-mrc6wb7l': {
    en: 'The setting is on a long wooden bench in an indoor subway-station hallway with a light yellow brick wall.',
    ko: '배경은 연한 노란색 벽돌 벽이 있는 실내 지하철역 복도의 긴 나무 벤치 주변입니다.',
  },
  'img-3sbx0nj-mrc6gjzm': {
    en: 'The setting is on a low stone wall along a Korean urban street with stone pavement, nearby greenery and trees, a black vertical information signboard with Korean text, and softly blurred storefronts and pedestrians in the distance. Shopping bags rest near the wall as ambient scene props; no slippers, visible men, or cropped people appear in the frame.',
    ko: '배경은 돌 포장도로와 낮은 돌담, 주변의 녹지와 나무, 한국어가 적힌 검은색 세로형 안내 표지판, 멀리 부드럽게 흐려진 상점과 보행자가 있는 한국의 도시 거리입니다. 쇼핑백은 돌담 근처의 주변 소품으로 놓여 있으며, 바닥에 슬리퍼가 없고 프레임 안에 남성이나 잘린 사람이 보이지 않습니다.',
  },
  'img-bphhf79-mrqapq7k': {
    en: 'The setting is on a narrow wooden bench outside a cozy urban cafe entrance, with a light gray brick wall, a wood-framed glass door, warm indoor light visible inside, and textured pavement below.',
    ko: '배경은 아늑한 도심 카페 입구 밖의 좁은 나무 벤치 주변이며, 연한 회색 벽돌 벽과 나무 프레임 유리문, 안쪽에서 비치는 따뜻한 실내 조명, 질감이 느껴지는 보도가 있습니다.',
  },
  'img-smmk0h3-mrkj032c': {
    en: 'The setting is a minimalist indoor space with a cream-colored wall and a narrow strip of honey-toned wooden flooring visible near the lower edge of the frame.',
    ko: '배경은 크림색 벽이 있는 미니멀한 실내이며, 프레임 하단 가장자리 근처에 꿀색 톤의 나무 바닥이 좁게 보입니다.',
  },
  'img-2g7r20m-mrqacgoo': {
    en: 'The setting is in front of a large mirror inside a clothing boutique, with clothing racks, mannequins displaying white tops, and warm overhead spotlights visible in the reflection.',
    ko: '배경은 의류 부티크 안의 커다란 거울 앞이며, 거울에는 옷걸이 행거와 흰색 상의를 입은 마네킹, 따뜻한 천장 스포트라이트가 비칩니다.',
  },
};

const OUTFIT_ADDITIONS = {
  'img-the22iw-mrq6nvbp': {
    en: 'A personal handbag is temporarily set on the entryway console nearby.',
    ko: '개인 핸드백은 가까운 현관 콘솔 위에 잠시 놓여 있습니다.',
  },
  'img-pgvd4cc-mrf15s5c': {
    en: 'A soft brown personal bag is temporarily placed on the table beside her.',
    ko: '부드러운 갈색 개인 가방은 그녀 옆 테이블 위에 잠시 놓여 있습니다.',
  },
  'img-qmphv6h-mrq7hy1e': {
    en: 'A pair of sunglasses is included with the personal accessories.',
    ko: '선글라스 한 개가 개인 액세서리에 포함됩니다.',
  },
  'img-x7kzfp8-mrqzhpxg': {
    en: 'A pair of sunglasses is held together with the phone.',
    ko: '선글라스는 휴대폰과 함께 손에 들려 있습니다.',
  },
  'img-7e0mn8j-mrc6wo4x': {
    en: 'A small pink quilted handbag is temporarily placed beside her.',
    ko: '작은 분홍색 퀼팅 핸드백은 그녀 옆에 잠시 놓여 있습니다.',
  },
  'img-45jv80h-mrq73qxt': {
    en: 'A paper grocery bag and one piece of citrus are included as carried personal items.',
    ko: '종이 식료품 가방과 감귤 한 개가 들고 온 개인 소지품으로 포함됩니다.',
  },
  'img-cwdrjpw-mrq6o72o': {
    en: 'A folded paper pastry bag is included as a carried personal item.',
    ko: '접힌 종이 페이스트리 가방이 들고 온 개인 소지품으로 포함됩니다.',
  },
  'img-c93nxic-mrq6nz0n': {
    en: 'A woven beach bag is included as a personal carried item.',
    ko: '짜임 비치백이 개인 휴대 소지품으로 포함됩니다.',
  },
  'img-q5g6xal-mrq7427t': {
    en: 'A personal bag with a visible strap and a transit card are included with the carried accessories.',
    ko: '끈이 보이는 개인 가방과 교통카드가 휴대 액세서리에 포함됩니다.',
  },
  'img-qffoge4-mrc72c0o': {
    en: 'A personal phone is temporarily placed on the table beside her.',
    ko: '개인 휴대폰은 그녀 옆 테이블 위에 잠시 놓여 있습니다.',
  },
  'img-2g7r20m-mrqacgoo': {
    en: 'A pink smartphone is included as a personal carried item.',
    ko: '분홍색 스마트폰이 개인 휴대 소지품으로 포함됩니다.',
  },
  'img-3yruc63-mrpxyks9': {
    en: 'A smartphone in a pale pink case is temporarily mounted vertically on a slim floor stand in front of her.',
    ko: '연분홍색 케이스가 씌워진 스마트폰은 그녀 앞의 슬림한 플로어 스탠드에 세로로 잠시 장착되어 있습니다.',
  },
};

const PHONE_OUTFIT_ADDITIONS = {
  'img-2syaph5-mrqzbvk1': { en: 'A personal smartphone is included for the selfie.', ko: '셀카 촬영용 개인 스마트폰이 포함됩니다.' },
  'img-the22iw-mrq6nvbp': { en: 'A slim personal phone is temporarily placed on a low stand.', ko: '슬림한 개인 휴대폰은 낮은 스탠드 위에 잠시 놓여 있습니다.' },
  'img-bo8dpq4-mrq5ra5x': { en: 'A personal smartphone is held just outside the selfie frame.', ko: '개인 스마트폰은 셀카 프레임 바로 바깥에서 들고 있습니다.' },
  'img-em4kgpv-mrpxzri4': { en: 'A personal smartphone is included for the selfie.', ko: '셀카 촬영용 개인 스마트폰이 포함됩니다.' },
  'img-hwp1eol-mrpr9ur6': { en: 'A personal smartphone is included among the carried items.', ko: '개인 스마트폰이 휴대 소지품에 포함됩니다.' },
  'img-bucpgf2-mrozj4gq': { en: 'A personal smartphone is held just outside the selfie frame.', ko: '개인 스마트폰은 셀카 프레임 바로 바깥에서 들고 있습니다.' },
  'img-beqvx2r-mrfm4vim': { en: 'A personal smartphone is held just outside the selfie frame.', ko: '개인 스마트폰은 셀카 프레임 바로 바깥에서 들고 있습니다.' },
  'img-oawtm62-mrffv78i': { en: 'A personal smartphone is included among the carried items.', ko: '개인 스마트폰이 휴대 소지품에 포함됩니다.' },
  'img-vfi7ez6-mrf3geec': { en: 'A personal smartphone is included for the mirror selfie.', ko: '거울 셀카 촬영용 개인 스마트폰이 포함됩니다.' },
  'img-y0wl3u8-mrdmwdcr': { en: 'A personal smartphone is included for the mirror selfie.', ko: '거울 셀카 촬영용 개인 스마트폰이 포함됩니다.' },
  'img-raoefp5-mrc76fb6': { en: 'A personal smartphone is included among the carried items.', ko: '개인 스마트폰이 휴대 소지품에 포함됩니다.' },
  'img-y2crld5-mrc6lksu': { en: 'A personal smartphone is included among the carried items.', ko: '개인 스마트폰이 휴대 소지품에 포함됩니다.' },
  'img-43wx8oi-mrc6gwnc': { en: 'A personal smartphone is included among the carried items.', ko: '개인 스마트폰이 휴대 소지품에 포함됩니다.' },
};

const EXPRESSION_ADDITIONS = {
  'img-61hr8n2-mrlyqw50': {
    en: 'Her raised elbow opens the upper-body silhouette and emphasizes the halter neckline and shoulders.',
    ko: '들어 올린 팔꿈치가 상체 실루엣을 열어 홀터넥과 어깨선을 강조합니다.',
  },
  'img-88kwk21-mrf3lczc': {
    en: 'One arm is raised to hold the phone near her face for the selfie.',
    ko: '한쪽 팔을 들어 셀카를 위해 휴대폰을 얼굴 가까이에 들고 있습니다.',
  },
};

const EXPRESSION_REPAIRS = {
  'img-zmao110-mrr8codl': {
    en: 'Camera angle, composition, pose, gaze, and expression are very important: a vertical full-body smartphone portrait photographed from a straight eye-level perspective, with the subject centered in the lower half of the frame. She stands with both legs close together, knees relaxed, feet aligned side by side, and her upper body leaning subtly backward. Both arms hang loosely at her sides inside the oversized sleeves, while the unbuttoned shirt drapes below both shoulders and opens around the torso. Her head turns slightly to one side and lowers gently, with her eyes looking downward and away from the camera. Several loose hair strands lift across her forehead and cheek in the breeze. Her lips part in a small natural smile, creating a shy, relaxed, and candid expression.',
    ko: '카메라 각도, 구도, 자세, 시선, 표정이 매우 중요합니다. 정면 눈높이 관점에서 촬영한 세로형 전신 스마트폰 인물 사진이며, 피사체는 프레임 하단 중앙에 위치합니다. 양다리를 모으고 무릎의 힘을 뺀 채 발을 나란히 두고 서 있으며, 상체는 아주 살짝 뒤로 기울어져 있습니다. 양팔은 오버사이즈 소매 안에서 옆으로 자연스럽게 늘어뜨리고, 단추를 푼 셔츠는 양어깨 아래로 흘러내려 몸통 부분이 열려 있습니다. 고개는 한쪽으로 약간 돌려 부드럽게 숙이고 시선은 카메라를 피해 아래쪽을 향합니다. 바람에 몇 가닥의 머리카락이 이마와 뺨 위로 흩날립니다. 입술은 작은 자연스러운 미소를 지으며 살짝 벌어져 있어 수줍고 편안하며 자연스러운 표정을 연출합니다.',
  },
  'img-4k3dfas-mrc71u4j': {
    en: 'High-angle shot, looking up at the camera with a playful wink and a soft smile while sitting with her legs crossed.',
    ko: '다리를 꼬고 앉아 장난스럽게 윙크하며 부드러운 미소로 카메라를 올려다보는 하이 앵글 구도입니다.',
  },
  'img-q4e7mpf-mrc6wkep': {
    en: 'High-angle medium shot, looking directly at the camera with a cute expression, puffing out her cheeks, and pointing one finger at her cheek.',
    ko: '하이 앵글 미디엄 샷에서 귀여운 표정으로 카메라를 정면으로 바라보며 볼을 부풀리고 한 손가락으로 볼을 가리킵니다.',
  },
  'img-vkxd422-mrc6wb7l': {
    en: 'Slightly high-angle shot, sitting with her legs crossed and looking directly at the camera with a calm, neutral expression.',
    ko: '다리를 꼬고 앉아 카메라를 정면으로 바라보며 차분하고 중립적인 표정을 짓는 약간 높은 앵글의 구도입니다.',
  },
  'img-3sbx0nj-mrc6gjzm': {
    en: 'Eye-level seated portrait with a relaxed, natural pose. She turns her torso slightly to one side, lowers her head gently, and holds the phone naturally in both hands with a calm, neutral expression.',
    ko: '눈높이의 앉은 인물 구도이며 편안하고 자연스러운 자세입니다. 몸을 약간 옆으로 틀고 고개를 부드럽게 숙인 채 양손으로 휴대폰을 자연스럽게 들고 차분하고 중립적인 표정을 짓습니다.',
  },
  'img-bphhf79-mrqapq7k': {
    en: 'Camera angle, composition, gaze, and expression are very important: a vertical full-body composition from a slightly front-facing natural smartphone perspective, with the subject centered slightly left. She sits with her knees pulled close, loosely wraps her arms around her legs, and clasps her hands near her knees in a relaxed casual posture. Her head tilts gently to one side, her eyes look off-camera to the left, and her soft pensive expression creates a calm, slightly dreamy mood.',
    ko: '카메라 각도, 구도, 시선, 표정이 매우 중요합니다. 자연스러운 스마트폰 관점의 약간 정면 각도에서 촬영한 세로형 전신 구도이며, 피사체는 중앙에서 약간 왼쪽에 위치합니다. 무릎을 몸 쪽으로 바짝 끌어올리고 팔로 다리를 느슨하게 감싼 채 손을 무릎 근처에서 맞잡은 편안하고 캐주얼한 자세입니다. 고개를 한쪽으로 부드럽게 기울이고 시선은 카메라 밖 왼쪽을 향하며, 생각에 잠긴 듯한 부드러운 표정으로 차분하고 약간 몽환적인 분위기를 냅니다.',
  },
  'img-smmk0h3-mrkj032c': {
    en: 'Camera angle, composition, gaze, and expression are very important: a vertical smartphone portrait photographed from a slightly elevated front-facing angle, framed from the upper thighs to above the bun, with the subject centered and filling most of the image. She stands with one arm hanging naturally along her body while the other is raised beside her face to form a wide peace sign with the index and middle fingers. Her shoulders remain relaxed and slightly uneven beneath the oversized sweatshirt. Her head tilts subtly toward the raised hand, both eyes squeeze shut, and her lips form a small pleased smile, creating a playful, cheerful, and slightly bashful expression.',
    ko: '카메라 각도, 구도, 시선, 표정이 매우 중요합니다. 약간 높은 정면 각도에서 촬영한 세로형 스마트폰 인물 사진으로, 허벅지 위쪽부터 번 헤어 위까지 담고 피사체가 중앙에서 프레임 대부분을 채웁니다. 한쪽 팔은 몸 옆으로 자연스럽게 내리고 다른 팔은 얼굴 옆으로 들어 올려 검지와 중지로 커다란 브이 사인을 만듭니다. 오버사이즈 스웨트셔츠 아래의 어깨는 편안하게 이완되어 약간 비대칭을 이룹니다. 고개는 들어 올린 손 쪽으로 살짝 기울이고 두 눈은 꼭 감으며, 입술에는 작고 만족스러운 미소를 지어 장난스럽고 쾌활하며 약간 수줍은 표정을 연출합니다.',
  },
  'img-2g7r20m-mrqacgoo': {
    en: 'She stands holding the phone in one hand to take the photo, with a subtle smile.',
    ko: '서서 한 손으로 휴대폰을 들어 사진을 찍으며 은은하게 미소 짓습니다.',
  },
  'img-c93nxic-mrq6nz0n': {
    en: 'Camera angle, composition, gaze, and expression are important: a low golden-hour fashion angle with water reflections behind the figure. She sits with one knee raised and the opposite leg extended, looking just past the camera with a calm neutral expression and relaxed lips. The framing keeps the hairstyle, hands, waistline, full clothing construction, leg line, and footwear readable while preserving the spontaneity of a current Instagram post.',
    ko: '카메라 각도, 구도, 시선, 표정이 중요합니다. 인물 뒤로 물 반사가 보이는 골든아워의 낮은 패션 각도입니다. 한쪽 무릎을 세우고 반대쪽 다리를 뻗어 앉아 카메라 너머를 약간 바라보며, 편안한 입술과 차분하고 중립적인 표정을 짓습니다.',
  },
  'img-3yruc63-mrpxyks9': {
    en: 'Camera angle, composition, gaze, and expression create a strong three-quarter rear-side perspective. She stands with her body turned almost fully sideways and slightly away from the camera, arches her lower back, pushes her hips prominently backward, and keeps both legs straight while using both hands to hold the dress high. Her head tilts downward toward the recording screen, her eyes focus on it, and her lips remain softly closed with a calm, concentrated, slightly self-conscious expression as she checks the recording.',
    ko: '카메라 각도, 구도, 시선, 표정은 강한 3/4 후측면 원근감을 만듭니다. 몸을 거의 완전히 옆으로 돌려 카메라에서 약간 멀어지는 방향으로 서서 허리를 아치형으로 굽히고 엉덩이를 뒤로 크게 뺀 채 두 다리를 곧게 펴며, 양손으로 드레스를 높이 들어 올립니다. 고개를 녹화 화면 쪽으로 숙이고 눈은 화면에 집중하며, 입술은 부드럽게 다문 채 녹화 상태를 확인하는 차분하고 집중된, 약간 쑥스러운 표정을 짓습니다.',
  },
};

function splitSentences(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return (text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [text]).map((part) => part.trim()).filter(Boolean);
}

function sentenceCase(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const result = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(result) ? result : result + '.';
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function genericizePersonalItemsInPose(value) {
  return String(value || '')
    .replace(/\b(?:the\s+)?(?:long\s+)?strap of (?:the\s+)?(?:(?:large|small|oversized|soft|structured|dark|light|brown|black|white|ivory|pink|beige|leather|nylon|quilted|shoulder)\s+)*(?:bag|handbag|backpack|purse|tote)\b/gi, 'the bag strap')
    .replace(/\b(?:(?:large|small|oversized|soft|structured|dark|light|brown|black|white|ivory|pink|beige|leather|nylon|quilted|grocery|pastry|beach|shopping|shoulder|tote)\s+)+(bag|handbag|backpack|purse)\b/gi, (_match, noun) => noun.toLowerCase() === 'backpack' ? 'backpack' : 'bag')
    .replace(/\b(?:the\s+)?(?:shoulder\s+)?(?:bag|handbag|purse|tote) strap\b/gi, 'the bag strap')
    .replace(/\s+/g, ' ')
    .trim();
}

function genericizeKoreanPersonalItemsInPose(value) {
  return String(value || '')
    .replace(/(?:길고\s+)?(?:큰|대형|작은|부드러운|검은색|갈색|흰색|하얀색|아이보리색|분홍색|베이지색|가죽|나일론|퀼팅|숄더|쇼핑|식료품|페이스트리|비치|토트)(?:\s+|빛\s*)+(?:가방|핸드백|백팩|숄더백|토트백|클러치)/g, '가방')
    .replace(/(?:가방|핸드백|백팩|숄더백|토트백)의\s+(?:긴\s+)?끈/g, '가방 끈')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPersonalPropBackgroundViolation(value) {
  const text = String(value || '');
  if (!/\b(?:bag|handbag|backpack|purse|clutch|tote|sunglasses|eyeglasses|spectacles|goggles|phone|smartphone|umbrella|wallet)\b/i.test(text)) return false;
  if (/\b(?:boutique|retail|merchandise|display (?:wall|rail|shelf)|rails? (?:holding|displaying)|price tags?|wine glasses|drinking glasses|phone lights?|phone-number|umbrella bases?|beach umbrella)\b/i.test(text)) return false;
  return /\b(?:her|beside|near|rests?|placed|set|hangs?|held|carried|wearing|against|seat|sofa|table|floor|platform|no bag)\b/i.test(text);
}

function hasPhysicalPhoneReference(value) {
  const text = String(value || '').replace(/\bsmartphone\s+(?:composition|portrait|perspective|selfie|photograph|shot)\b/gi, 'camera composition');
  return /\b(?:hold(?:s|ing)?|grip(?:s|ping)?|focus(?:es|ed)?\s+(?:intently\s+|directly\s+)?on|look(?:s|ing)?\s+(?:at|toward)|directed\s+toward)\b[^.]{0,100}\b(?:phone|smartphone)\b|\b(?:phone|smartphone)\b[^.]{0,100}\b(?:screen|case|cover(?:s|ing)?|rests?|placed|set|mounted|held|near|beside|outside|recording)\b/i.test(text);
}

function personalBackgroundViolationKorean(value) {
  const text = String(value || '');
  if (!/(?:가방|핸드백|백팩|숄더백|토트백|클러치|선글라스|안경|휴대폰|지갑|우산)/.test(text)) return false;
  if (/(?:부티크|매장|판매|전시|진열|금속 레일|가격표|와인잔|휴대폰 불빛|전화번호|우산 받침)/.test(text)) return false;
  return /(?:그녀|옆|좌석|소파|테이블|바닥|플랫폼|놓여|걸쳐|들고|착용)/.test(text);
}

function promptText(promptJson) {
  return SECTION_KEYS.map((key) => (promptJson?.[key]?.sentences || []).map((sentence) => sentence.en).filter(Boolean).join('\n').trim()).filter(Boolean).join('\n\n\n');
}

function simpleStringHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function promptFingerprint(promptJson) {
  const parts = [];
  SECTION_KEYS.forEach((key) => {
    (promptJson?.[key]?.sentences || []).forEach((sentence) => {
      parts.push([sentence.id || '', String(sentence.en || '').trim(), String(sentence.ko || '').trim()].join('\n'));
    });
  });
  return simpleStringHash(parts.join('\n---\n'));
}

function uniqueId(promptJson, sectionKey, preferred) {
  const ids = new Set(SECTION_KEYS.flatMap((key) => (promptJson?.[key]?.sentences || []).map((sentence) => sentence.id)));
  let id = preferred;
  let suffix = 2;
  while (ids.has(id)) id = preferred + '-' + suffix++;
  return id;
}

function appendIfMissing(promptJson, sectionKey, addition, preferredId) {
  if (!promptJson?.[sectionKey] || !addition) return false;
  const existing = normalize((promptJson[sectionKey].sentences || []).map((sentence) => sentence.en).join(' '));
  if (existing.includes(normalize(addition.en))) return false;
  promptJson[sectionKey].sentences.push({
    id: uniqueId(promptJson, sectionKey, preferredId),
    en: addition.en,
    ko: addition.ko,
  });
  return true;
}

function refineExpression(promptJson, itemId) {
  if (!promptJson?.expression_pose?.sentences) return;
  promptJson.expression_pose.sentences.forEach((sentence) => {
    sentence.en = genericizePersonalItemsInPose(sentence.en)
      .replace(/She sits with soft cream walls\./gi, 'She sits upright.')
      .replace(/The raised rear leg forms a strong diagonal silhouette while the (?:oversized )?bag and cardigan add volume around her torso\./gi, 'The raised rear leg forms a strong diagonal silhouette.')
      .replace(/The composition emphasizes the direct eye contact, sleek tied-back hairstyle, high-neck pink dress, delicate jewelry, (?:bag|handbag), and intimate restaurant-table perspective\./gi, 'The composition emphasizes direct eye contact and an intimate restaurant-table perspective.')
      .replace(/The subject occupies the center of the image, with the raised forearm forming a strong diagonal line across the upper composition and the handbag providing visual balance near the lower edge\./gi, 'The raised forearm forms a strong diagonal line across the upper composition.')
      .replace(/The composition emphasizes the sculptural white ruffles, exposed waist, fitted low-rise jeans, bag, turned head, and elegant over-the-shoulder pose\./gi, 'The composition emphasizes the turned head and elegant over-the-shoulder pose.')
      .replace(/(?:her|the) eyes focused directly on the phone/gi, 'her gaze directed forward')
      .replace(/Her body faces forward in a full standing pose with both legs straight and close together, while both arms are lifted outward at about waist to chest height to display the tote bag and small pouch\./gi, 'Her body faces forward in a full standing pose with both legs straight and close together, while both arms are lifted outward at about waist to chest height to display the items held in each hand.')
      .replace(/She walks with a natural mid-step pose, one arm relaxed and the other holding the handbag, hair lightly blown to the side as if caught by a breeze, creating a candid motion feel,[^.]*\./gi, 'She walks in a natural mid-step pose, with one arm relaxed and the other holding a bag while her hair is lightly blown to the side.')
      .replace(/\s+/g, ' ')
      .trim();
    sentence.ko = genericizeKoreanPersonalItemsInPose(sentence.ko)
      .replace(/그녀는 앉아 한 실내 공간의 크고 질감이 느껴지는 흰색 소파에 앉아 있습니다\.\s*/g, '')
      .trim();
  });

  const compositionOnlyItem = /\bThe composition also includes (?:a )?(?:folded paper )?(?:grocery|pastry|beach)?\s*bag\b/i;
  promptJson.expression_pose.sentences = promptJson.expression_pose.sentences.map((sentence) => {
    const english = splitSentences(sentence.en).filter((part) => (
      !compositionOnlyItem.test(part)
      && !(itemId === 'img-qffoge4-mrc72c0o' && /small white table beside her holding two iced drinks/i.test(part))
    ));
    const korean = splitSentences(sentence.ko).filter((part) => (
      !/(?:구도|구성).*?(?:식료품 가방|페이스트리 가방|비치백)/.test(part)
      && !(itemId === 'img-qffoge4-mrc72c0o' && /작은 흰색 테이블.*(?:휴대폰|디저트)/.test(part))
    ));
    return { ...sentence, en: english.join(' '), ko: korean.join(' ') };
  }).filter((sentence) => sentence.en && sentence.ko);

  appendIfMissing(promptJson, 'expression_pose', EXPRESSION_ADDITIONS[itemId], 'expression_pose-personal-prop-action');
}

function refinePrompt(promptJson, itemId) {
  if (!promptJson) return;
  const backgroundRepair = BACKGROUND_REPAIRS[itemId];
  if (backgroundRepair) {
    const id = promptJson.background?.sentences?.[0]?.id || 'background-1';
    promptJson.background.sentences = [{ id, en: backgroundRepair.en, ko: backgroundRepair.ko }];
  }
  const expressionRepair = EXPRESSION_REPAIRS[itemId];
  if (expressionRepair) {
    const id = promptJson.expression_pose?.sentences?.[0]?.id || 'expression_pose-1';
    promptJson.expression_pose.sentences = [{ id, en: expressionRepair.en, ko: expressionRepair.ko }];
  }
  appendIfMissing(promptJson, 'outfit', OUTFIT_ADDITIONS[itemId], 'outfit-personal-prop');
  appendIfMissing(promptJson, 'outfit', PHONE_OUTFIT_ADDITIONS[itemId], 'outfit-personal-phone');
  if (itemId === 'img-zrlisx0-mrc77pwq') {
    appendIfMissing(promptJson, 'details', { en: 'No bag is present.', ko: '가방은 등장하지 않습니다.' }, 'details-bag-exclusion');
  }
  refineExpression(promptJson, itemId);
}

function updateSettings(settings) {
  const personalRule = 'Personal accessories and carried items such as bags, phones, sunglasses, eyeglasses, umbrellas, and wallets stay in Outfit even when temporarily set on a seat, table, floor, or beside the subject. Retail merchandise and shared scene props that do not belong to the subject stay in Background. Expression / Pose may reference a personal item only generically for an interaction and must not describe its color, material, brand, size, or style.';
  if (!String(settings.promptInstruction || '').includes('Personal accessories and carried items')) {
    settings.promptInstruction = String(settings.promptInstruction || '').replace(
      '2. Outfit must describe only clothing, accessories, wearable items, and held objects. Do not include pose, action, body placement, background, camera angle, gaze, or expression.',
      '2. Outfit must describe only clothing, accessories, wearable items, and held objects. ' + personalRule + ' Do not include pose, action, body placement, background, camera angle, gaze, or expression.',
    ).replace(
      '- Outfit must include only clothing, accessories, wearable items, and held objects; it must not include pose, action, background, camera angle, gaze, or expression.',
      '- Outfit must include only clothing, accessories, wearable items, and held objects. ' + personalRule + ' It must not include pose, action, background, camera angle, gaze, or expression.',
    );
  }
  if (!String(settings.promptSettings?.englishRules || '').includes('Personal accessories and carried items')) {
    settings.promptSettings.englishRules += ' ' + personalRule;
  }
}

function audit(items) {
  const result = {
    backgroundEnglish: [],
    backgroundKorean: [],
    expressionDetailedEnglish: [],
    expressionDetailedKorean: [],
    expressionBackgroundEnglish: [],
    expressionBackgroundKorean: [],
    posePhoneMissingOutfit: [],
    emptySections: [],
  };
  const detailedEnglish = /\b(?:large|small|oversized|soft|structured|dark|light|brown|black|white|ivory|pink|beige|red|blue|silver|gold|pale|gray|grey|leather|nylon|quilted|woven|grocery|pastry|beach|shopping|shoulder|tote)\s+(?:bag|handbag|backpack|purse|phone|smartphone|sunglasses|eyeglasses|spectacles|goggles|umbrella|wallet)\b|\b(?:phone|smartphone)\s+(?:in|with)\s+(?:a\s+)?[^,.]{0,40}\bcase\b/i;
  const detailedKorean = /(?:큰|대형|작은|부드러운|검은색|갈색|흰색|아이보리색|분홍색|연분홍색|베이지색|빨간색|파란색|은색|금색|회색|가죽|나일론|퀼팅|짜임|숄더|쇼핑|식료품|페이스트리|비치|토트)\s*(?:가방|핸드백|백팩|숄더백|토트백|클러치|휴대폰|스마트폰|선글라스|안경|우산|지갑)|(?:휴대폰|스마트폰).*?케이스/;
  items.forEach((item) => {
    SECTION_KEYS.forEach((key) => {
      const sentences = item.promptJson?.[key]?.sentences || [];
      if (!sentences.length || sentences.some((sentence) => !String(sentence.en || '').trim() || !String(sentence.ko || '').trim())) result.emptySections.push({ id: item.id, section: key });
    });
    const backgroundEn = (item.promptJson?.background?.sentences || []).map((sentence) => sentence.en).join(' ');
    const backgroundKo = (item.promptJson?.background?.sentences || []).map((sentence) => sentence.ko).join(' ');
    const expressionEn = (item.promptJson?.expression_pose?.sentences || []).map((sentence) => sentence.en).join(' ');
    const expressionKo = (item.promptJson?.expression_pose?.sentences || []).map((sentence) => sentence.ko).join(' ');
    const outfitEn = (item.promptJson?.outfit?.sentences || []).map((sentence) => sentence.en).join(' ');
    if (isPersonalPropBackgroundViolation(backgroundEn)) result.backgroundEnglish.push({ id: item.id, text: backgroundEn });
    if (personalBackgroundViolationKorean(backgroundKo)) result.backgroundKorean.push({ id: item.id, text: backgroundKo });
    if (detailedEnglish.test(expressionEn)) result.expressionDetailedEnglish.push({ id: item.id, text: expressionEn });
    if (detailedKorean.test(expressionKo)) result.expressionDetailedKorean.push({ id: item.id, text: expressionKo });
    if (/\b(?:cream|brick|stone|wood-paneled) walls?\b/i.test(expressionEn)) result.expressionBackgroundEnglish.push({ id: item.id, text: expressionEn });
    if (/(?:크림색|벽돌|석재|나무 패널)\s*벽/.test(expressionKo)) result.expressionBackgroundKorean.push({ id: item.id, text: expressionKo });
    if (hasPhysicalPhoneReference(expressionEn) && !/\b(?:phone|smartphone)\b/i.test(outfitEn)) result.posePhoneMissingOutfit.push({ id: item.id, text: expressionEn });
  });
  return Object.fromEntries(Object.entries(result).map(([key, values]) => [key, { count: values.length, samples: values.slice(0, 5) }]));
}

function refineItems(items) {
  const stats = { currentChanged: 0, baselineChanged: 0, versionsChanged: 0 };
  items.forEach((item) => {
    const currentBefore = JSON.stringify(item.promptJson);
    const baselineBefore = JSON.stringify(item.promptBaselineJson);
    refinePrompt(item.promptJson, item.id);
    refinePrompt(item.promptBaselineJson, item.id);
    if (currentBefore !== JSON.stringify(item.promptJson)) stats.currentChanged += 1;
    if (baselineBefore !== JSON.stringify(item.promptBaselineJson)) stats.baselineChanged += 1;
    item.finalPrompt = promptText(item.promptJson);
    if (item.promptBaselineJson) item.promptBaselineFingerprint = promptFingerprint(item.promptBaselineJson);
    (item.versions || []).forEach((version) => {
      const versionBefore = JSON.stringify(version.promptJson);
      refinePrompt(version.promptJson, item.id);
      if (versionBefore !== JSON.stringify(version.promptJson)) stats.versionsChanged += 1;
      version.finalPrompt = promptText(version.promptJson);
    });
  });
  return stats;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
  const write = process.argv.includes('--write');
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const beforeItems = JSON.stringify(items);
  const beforeSettings = JSON.stringify(settings);
  const stats = refineItems(items);
  updateSettings(settings);
  const itemsChanged = beforeItems === JSON.stringify(items) ? 0 : 1;
  const settingsChanged = beforeSettings === JSON.stringify(settings) ? 0 : 1;
  const report = audit(items);
  const backups = [];
  if (write && (itemsChanged || settingsChanged)) {
    const stamp = timestamp();
    const itemBackup = path.join(ROOT, 'backup', 'items-before-personal-prop-refinement-' + stamp + '.json');
    const settingsBackup = path.join(ROOT, 'backup', 'settings-before-personal-prop-refinement-' + stamp + '.json');
    fs.copyFileSync(ITEMS_PATH, itemBackup);
    fs.copyFileSync(SETTINGS_PATH, settingsBackup);
    fs.writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2) + '\n', 'utf8');
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    backups.push(itemBackup, settingsBackup);
  }
  process.stdout.write(JSON.stringify({ mode: write ? 'write' : 'dry-run', itemCount: items.length, itemsChanged, settingsChanged, stats, backups, audit: report }, null, 2) + '\n');
}

module.exports = {
  genericizePersonalItemsInPose,
  isPersonalPropBackgroundViolation,
  refineItems,
};

if (require.main === module) main();
