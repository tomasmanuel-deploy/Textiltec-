// Shared client store for all API endpoints
// This ensures data consistency across all client operations

import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface Client {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email?: string;
  phone?: string;
  clientType: 'individual' | 'company';
  status: 'active' | 'inactive';
  notes?: string;
  companyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Initial mock clients
const initialMockClients: { [key: string]: Client } = {
  '1': {
    id: '1',
    name: 'Empresa Cliente, Lda',
    tradeName: 'Empresa Cliente',
    nif: '5000789012',
    address: 'Avenida Comercial 456, Luanda',
    email: 'cliente@empresa.co.ao',
    phone: '+244 923 789 012',
    clientType: 'company',
    status: 'active',
    createdAt: new Date('2023-01-15'),
    updatedAt: new Date('2023-01-15')
  },
  '2': {
    id: '2',
    name: 'Cliente Individual',
    nif: '100123456LA041',
    address: 'Rua Residencial 789, Luanda',
    email: 'cliente@email.com',
    phone: '+244 923 123 456',
    clientType: 'individual',
    status: 'active',
    createdAt: new Date('2023-02-10'),
    updatedAt: new Date('2023-02-10')
  },
  '3': {
    id: '3',
    name: 'Potencial Cliente, S.A.',
    tradeName: 'Potencial Cliente',
    nif: '5000789013',
    address: 'Avenida Empresarial 321, Luanda',
    email: 'info@potencialcliente.co.ao',
    phone: '+244 923 321 654',
    clientType: 'company',
    status: 'active',
    createdAt: new Date('2023-03-05'),
    updatedAt: new Date('2023-03-05')
  },
  '4': {
    id: '4',
    name: 'Cliente Inativo, Lda',
    nif: '5000789014',
    address: 'Rua Antiga 123, Luanda',
    email: 'antigo@cliente.co.ao',
    phone: '+244 923 111 222',
    clientType: 'company',
    status: 'inactive',
    createdAt: new Date('2022-12-01'),
    updatedAt: new Date('2023-01-01')
  }
};

// Shared client store - this will be used by all API endpoints
class ClientStore {
  private clients: { [key: string]: Client } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('clients.json');
    this.loadClients();
  }

  // Load clients from file or initialize with mock data
  private loadClients(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load from file if exists
      if (fs.existsSync(this.dataFilePath)) {
        const fileContent = fs.readFileSync(this.dataFilePath, 'utf-8');
        const data = JSON.parse(fileContent);
        this.clients = data.clients || {};
        this.nextId = data.nextId || 1;
        console.log(`Loaded ${Object.keys(this.clients).length} clients from file`);
      } else {
        // Initialize with empty data
        this.clients = {};
        this.nextId = 1;
        this.saveClients();
        console.log('Initialized with empty clients');
      }
    } catch (error) {
      console.error('Error loading clients:', error);
      // Fallback to empty data
      this.clients = {};
      this.nextId = 1;
    }
  }

  // Save clients to file
  private saveClients(): void {
    try {
      const data = {
        clients: this.clients,
        nextId: this.nextId,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving clients:', error);
    }
  }

  // Get all clients
  // Get all clients (sorted by most recent first)
  getAllClients(): Client[] {
    return Object.values(this.clients).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  // Get client by ID
  getClientById(id: string): Client | null {
    return this.clients[id] || null;
  }

  // Create a new client
  createClient(clientData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Client {
    const newId = this.nextId.toString();
    this.nextId++;

    const newClient: Client = {
      ...clientData,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.clients[newId] = newClient;
    this.saveClients(); // Save to file after creating
    return newClient;
  }

  // Update a client
  updateClient(id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Client | null {
    if (this.clients[id]) {
      this.clients[id] = { 
        ...this.clients[id], 
        ...updates, 
        updatedAt: new Date() 
      };
      this.saveClients(); // Save to file after updating
      return this.clients[id];
    }
    return null;
  }

  // Delete a client
  deleteClient(id: string): boolean {
    if (this.clients[id]) {
      delete this.clients[id];
      this.saveClients(); // Save to file after deleting
      return true;
    }
    return false;
  }

  // Check if NIF exists (excluding specific client ID)
  nifExists(nif: string, excludeId?: string): boolean {
    return Object.values(this.clients).some(client => 
      client.nif === nif && client.id !== excludeId
    );
  }

  // Filter clients (sorted by most recent first)
  filterClients(options: {
    status?: 'active' | 'inactive';
    search?: string;
    limit?: number;
    offset?: number;
  }): { clients: Client[]; total: number } {
    let filteredClients = Object.values(this.clients);

    // Filter by status
    if (options.status) {
      filteredClients = filteredClients.filter(client => client.status === options.status);
    }

    // Search by name, tradeName, or NIF
    if (options.search) {
      const searchTerm = options.search.toLowerCase();
      filteredClients = filteredClients.filter(client => 
        client.name.toLowerCase().includes(searchTerm) ||
        client.nif.toLowerCase().includes(searchTerm) ||
        (client.tradeName && client.tradeName.toLowerCase().includes(searchTerm))
      );
    }

    // Sort by createdAt date, most recent first
    filteredClients = filteredClients.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Pagination
    const total = filteredClients.length;
    const offset = options.offset || 0;
    const limit = options.limit || total;
    filteredClients = filteredClients.slice(offset, offset + limit);

    return { clients: filteredClients, total };
  }
}

export const clientStore = new ClientStore();