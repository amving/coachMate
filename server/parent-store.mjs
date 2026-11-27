import { HttpError } from './sheets.mjs';

export function parentAppTransport(connection) {
  const root='/v1/'+connection.root;
  return {
    async request({url,data}){
      const path=new URL(url).pathname;
      if(!path.startsWith(root+'/')&&!path.startsWith(root+':'))throw new Error('Ongeldig pad voor de ouderopslag.');
      const result=await connection.request(path.slice(root.length),data);
      if(result===null)throw Object.assign(new Error('Ouderdocument ontbreekt.'),{response:{status:404}});
      return {data:result};
    },
  };
}

const scalar = value => typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, scalar(value)]));
const unpack = doc => ({
  id: doc.name.split('/').at(-1),
  version: doc.updateTime,
  data: Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) =>
    [key, value.integerValue === undefined ? value.stringValue : Number(value.integerValue)])),
});

export class ParentStore {
  constructor(auth, project, database = '(default)') {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(project) || !/^(?:\(default\)|[a-z][a-z0-9-]{2,62})$/.test(database)) {
      throw new Error('Invalid parent portal Firestore configuration.');
    }
    this.auth = auth;
    this.root = 'projects/' + project + '/databases/' + database + '/documents';
    this.base = 'https://firestore.googleapis.com/v1/' + this.root;
  }
  name(collection, id) { return this.root + '/cmParent' + collection + '/' + id; }
  async get(collection, id) {
    try {
      const {data} = await this.auth.request({url: 'https://firestore.googleapis.com/v1/' + this.name(collection, id)});
      return unpack(data);
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }
  async find(collection, key, value) {
    const {data} = await this.auth.request({
      url: this.base + ':runQuery', method: 'POST',
      data: {structuredQuery: {from: [{collectionId: 'cmParent' + collection}],
        where: {fieldFilter: {field: {fieldPath: key}, op: 'EQUAL', value: scalar(value)}}, limit: 5001}},
    });
    const records = data.flatMap(row => row.document ? [unpack(row.document)] : []);
    if (records.length > 5000) throw new HttpError(503, 'Het ouderportaal kan deze gegevens momenteel niet laden.');
    return records;
  }
  writes(changes) {
    return changes.map(change => {
      const name = this.name(change.collection, change.id);
      const currentDocument = change.version ? {updateTime: change.version} : {exists: false};
      return change.remove ? {delete: name, currentDocument} :
        {update: {name, fields: fields(change.data)}, currentDocument};
    });
  }
  async commit(changes) {
    try {
      await this.auth.request({url: this.base + ':commit', method: 'POST', data: {writes: this.writes(changes)}, retry: false});
    } catch (error) {
      if ([409, 412].includes(error.response?.status) ||
        ['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS','NOT_FOUND'].includes(error.response?.data?.error?.status)) {
        throw new HttpError(409, 'De gegevens zijn gewijzigd. Vernieuw voordat je opnieuw opslaat.');
      }
      throw error;
    }
  }
}
