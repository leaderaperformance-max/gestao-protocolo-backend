import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('supabase.url');
    const key = config.get<string>('supabase.serviceRoleKey');
    if (!url || !key) throw new Error('Supabase credentials not configured');
    this.client = createClient(url, key);
    this.bucket = config.get<string>('supabase.bucket') ?? 'attachments';
  }

  get storage() {
    return this.client.storage;
  }
}
