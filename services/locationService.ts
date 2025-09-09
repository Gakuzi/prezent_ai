/**
 * Finds detailed location information, including points of interest, from geographic coordinates using the OpenStreetMap Nominatim API.
 * @param lat Latitude
 * @param lon Longitude
 * @returns A promise that resolves to a descriptive location string or null if not found.
 */
export const findLocationDetails = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ru`, {
      headers: {
        'User-Agent': 'PresentationMasterAI/1.0 (https://studio.co/)'
      }
    });
    
    if (!response.ok) {
      console.error("Location details request failed:", response.statusText);
      return null;
    }
    const data = await response.json();

    if (data.error) {
      console.error("Location details error:", data.error);
      return null;
    }
    
    const category = data.category;
    const type = data.type;
    const name = data.name;
    const address = data.address;

    let locationDescription = '';
    
    // Prioritize named features like POIs, but exclude generic administrative boundaries
    if (name && category !== 'boundary' && type !== 'administrative') {
      locationDescription = name;
    } else if (address) {
        // Fallback to address components
        const parts = [
            address.road,
            address.city || address.town || address.village,
            address.country
        ].filter(Boolean);
        locationDescription = parts.join(', ');
    } else {
        return null;
    }
    
    // Add context from category for better AI understanding
    const categoryMap: { [key: string]: string } = {
        'tourism': 'туристический объект',
        'historic': 'историческое место',
        'natural': 'природный объект',
        'building': 'здание',
        'leisure': 'место отдыха'
    };
    
    if (category && categoryMap[category]) {
        return `${locationDescription} (${categoryMap[category]})`;
    }

    return locationDescription;

  } catch (error) {
    console.error("An error occurred during location details lookup:", error);
    return null;
  }
};